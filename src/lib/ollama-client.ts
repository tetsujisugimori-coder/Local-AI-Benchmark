import type {
  BenchmarkError,
  BenchmarkErrorCode,
  BenchmarkRunRequest,
} from "@/types/benchmark";
import { getRuntimeConfig } from "@/lib/runtime-config";

type OllamaModelResponse = {
  name?: string;
  model?: string;
  modified_at?: string;
  size?: number;
  details?: {
    parameter_size?: string;
    quantization_level?: string;
  };
};

export type InstalledOllamaModel = {
  id: string;
  modifiedAt: string;
  size: number;
  parameterSize: string | null;
  quantizationLevel: string | null;
};

export type OllamaGenerateResponse = {
  response: string;
  doneReason: string | null;
  totalDurationNs: number | null;
  loadDurationNs: number | null;
  promptEvalCount: number | null;
  promptEvalDurationNs: number | null;
  evalCount: number | null;
  evalDurationNs: number | null;
};

type OllamaGenerateChunk = {
  response?: unknown;
  done?: unknown;
  done_reason?: unknown;
  total_duration?: unknown;
  load_duration?: unknown;
  prompt_eval_count?: unknown;
  prompt_eval_duration?: unknown;
  eval_count?: unknown;
  eval_duration?: unknown;
  error?: unknown;
};

export class OllamaClientError extends Error {
  constructor(
    public readonly code: BenchmarkErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OllamaClientError";
  }

  toBenchmarkError(): BenchmarkError {
    return { code: this.code, message: this.message };
  }
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mapResponseError(status: number, message: string) {
  const normalized = message.toLowerCase();
  if (
    status === 404 ||
    normalized.includes("not found") ||
    normalized.includes("pull model")
  ) {
    return new OllamaClientError(
      "MODEL_NOT_INSTALLED",
      "指定モデルがOllamaにインストールされていません。",
    );
  }

  if (normalized.includes("load") || normalized.includes("memory")) {
    return new OllamaClientError(
      "MODEL_LOAD_FAILED",
      `モデルの読み込みに失敗しました: ${message}`,
    );
  }

  return new OllamaClientError(
    "OLLAMA_ERROR",
    `Ollamaがエラーを返しました: ${message}`,
  );
}

async function readErrorMessage(response: Response) {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string"
      ? body.error
      : `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

async function withOllamaTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  requestSignal?: AbortSignal,
) {
  const { requestTimeoutMs } = getRuntimeConfig();
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, requestTimeoutMs);
  const abortFromRequest = () => controller.abort();
  requestSignal?.addEventListener("abort", abortFromRequest, { once: true });

  try {
    return await operation(controller.signal);
  } catch (error) {
    if (error instanceof OllamaClientError) {
      throw error;
    }

    if (requestSignal?.aborted) {
      throw new OllamaClientError("ABORTED", "ユーザーが実行を中止しました。");
    }

    if (timedOut) {
      throw new OllamaClientError(
        "TIMEOUT",
        `Ollamaの応答が${requestTimeoutMs}ms以内に完了しませんでした。`,
      );
    }

    if (error instanceof TypeError) {
      throw new OllamaClientError(
        "OLLAMA_NOT_RUNNING",
        "Ollamaへ接続できません。Ollamaが起動しているか確認してください。",
      );
    }

    throw new OllamaClientError(
      "CONNECTION_FAILED",
      "Ollama APIとの通信に失敗しました。",
    );
  } finally {
    clearTimeout(timeoutId);
    requestSignal?.removeEventListener("abort", abortFromRequest);
  }
}

async function ollamaFetch(
  path: string,
  init: RequestInit = {},
  signal: AbortSignal,
) {
  const { ollamaBaseUrl } = getRuntimeConfig();
  const response = await fetch(`${ollamaBaseUrl}${path}`, {
    ...init,
    cache: "no-store",
    signal,
    headers: {
      Accept: "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw mapResponseError(response.status, await readErrorMessage(response));
  }

  return response;
}

export async function getOllamaVersion() {
  return withOllamaTimeout(async (signal) => {
    const response = await ollamaFetch("/api/version", {}, signal);
    const body = (await response.json()) as { version?: unknown };

    if (typeof body.version !== "string") {
      throw new OllamaClientError(
        "INVALID_RESPONSE",
        "Ollamaのバージョン応答が不正です。",
      );
    }

    return body.version;
  });
}

export async function listInstalledModels() {
  return withOllamaTimeout(async (signal) => {
    const response = await ollamaFetch("/api/tags", {}, signal);
    const body = (await response.json()) as { models?: unknown };

    if (!Array.isArray(body.models)) {
      throw new OllamaClientError(
        "INVALID_RESPONSE",
        "Ollamaのモデル一覧応答が不正です。",
      );
    }

    return body.models.flatMap((value): InstalledOllamaModel[] => {
      if (typeof value !== "object" || value === null) {
        return [];
      }

      const model = value as OllamaModelResponse;
      const id = model.model ?? model.name;
      if (
        typeof id !== "string" ||
        typeof model.modified_at !== "string" ||
        typeof model.size !== "number"
      ) {
        return [];
      }

      return [
        {
          id,
          modifiedAt: model.modified_at,
          size: model.size,
          parameterSize: model.details?.parameter_size ?? null,
          quantizationLevel: model.details?.quantization_level ?? null,
        },
      ];
    });
  });
}

function normalizeGenerateChunk(
  chunk: OllamaGenerateChunk,
  responseText: string,
): OllamaGenerateResponse {
  if (typeof chunk.error === "string") {
    throw mapResponseError(500, chunk.error);
  }

  return {
    response: responseText,
    doneReason:
      typeof chunk.done_reason === "string" ? chunk.done_reason : null,
    totalDurationNs: optionalNumber(chunk.total_duration),
    loadDurationNs: optionalNumber(chunk.load_duration),
    promptEvalCount: optionalNumber(chunk.prompt_eval_count),
    promptEvalDurationNs: optionalNumber(chunk.prompt_eval_duration),
    evalCount: optionalNumber(chunk.eval_count),
    evalDurationNs: optionalNumber(chunk.eval_duration),
  };
}

async function readStreamingResponse(response: Response) {
  if (!response.body) {
    throw new OllamaClientError(
      "INVALID_RESPONSE",
      "Ollamaのストリーミング応答を読み取れません。",
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let responseText = "";
  let finalChunk: OllamaGenerateChunk | null = null;

  const parseLine = (line: string) => {
    if (!line.trim()) {
      return;
    }

    let chunk: OllamaGenerateChunk;
    try {
      chunk = JSON.parse(line) as OllamaGenerateChunk;
    } catch {
      throw new OllamaClientError(
        "INVALID_RESPONSE",
        "Ollamaから不正なストリーミング応答が返されました。",
      );
    }

    if (typeof chunk.error === "string") {
      throw mapResponseError(500, chunk.error);
    }
    if (typeof chunk.response === "string") {
      responseText += chunk.response;
    }
    finalChunk = chunk;
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    lines.forEach(parseLine);

    if (done) {
      parseLine(buffer);
      break;
    }
  }

  const completedChunk = finalChunk as OllamaGenerateChunk | null;
  if (!completedChunk || completedChunk.done !== true) {
    throw new OllamaClientError(
      "INVALID_RESPONSE",
      "Ollamaのストリーミング応答が完了しませんでした。",
    );
  }

  return normalizeGenerateChunk(completedChunk, responseText);
}

export async function generateResponse(
  request: BenchmarkRunRequest,
  signal: AbortSignal,
) {
  return withOllamaTimeout(async (operationSignal) => {
    const response = await ollamaFetch(
      "/api/generate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: request.modelId,
          prompt: request.prompt,
          system: request.systemPrompt || undefined,
          stream: request.stream,
          keep_alive: request.runMode === "cold" ? 0 : "5m",
          options: {
            temperature: request.temperature,
            seed: request.seed,
            num_predict: request.maxTokens,
            num_ctx: request.contextLength,
          },
        }),
      },
      operationSignal,
    );

    if (request.stream) {
      return readStreamingResponse(response);
    }

    let chunk: OllamaGenerateChunk;
    try {
      chunk = (await response.json()) as OllamaGenerateChunk;
    } catch {
      throw new OllamaClientError(
        "INVALID_RESPONSE",
        "Ollamaから不正なJSON応答が返されました。",
      );
    }

    if (typeof chunk.response !== "string" || chunk.done !== true) {
      throw new OllamaClientError(
        "INVALID_RESPONSE",
        "Ollamaの生成応答に必要な項目がありません。",
      );
    }

    return normalizeGenerateChunk(chunk, chunk.response);
  }, signal);
}

export function toBenchmarkError(error: unknown): BenchmarkError {
  if (error instanceof OllamaClientError) {
    return error.toBenchmarkError();
  }

  return {
    code: "OLLAMA_ERROR",
    message: error instanceof Error ? error.message : "不明なエラーです。",
  };
}
