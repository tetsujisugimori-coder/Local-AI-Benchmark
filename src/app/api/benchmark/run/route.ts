import { BENCHMARK_MODELS } from "@/config/models";
import { calculateTokensPerSecond } from "@/lib/metrics";
import { generateResponse, toBenchmarkError } from "@/lib/ollama-client";
import { parseBenchmarkRunRequest } from "@/lib/validation";
import type {
  BenchmarkResult,
  BenchmarkRunRequest,
  BenchmarkSettings,
} from "@/types/benchmark";

function getSettings(request: BenchmarkRunRequest): BenchmarkSettings {
  return {
    systemPrompt: request.systemPrompt,
    temperature: request.temperature,
    seed: request.seed,
    maxTokens: request.maxTokens,
    contextLength: request.contextLength,
    executionCount: request.executionCount,
    runMode: request.runMode,
    stream: request.stream,
    think: request.think,
  };
}

export async function POST(request: Request) {
  let runRequest: BenchmarkRunRequest;
  try {
    runRequest = parseBenchmarkRunRequest(await request.json());
  } catch (error) {
    return Response.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message:
            error instanceof Error ? error.message : "入力内容が不正です。",
        },
      },
      { status: 400 },
    );
  }

  const model = BENCHMARK_MODELS.find(
    (definition) => definition.id === runRequest.modelId,
  );
  if (!model) {
    return Response.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "登録されていないモデルです。",
        },
      },
      { status: 400 },
    );
  }

  const startedAt = new Date().toISOString();
  const startedTime = performance.now();

  try {
    const response = await generateResponse(runRequest, request.signal);
    const finishedAt = new Date().toISOString();
    const result: BenchmarkResult = {
      modelId: model.id,
      displayName: model.displayName,
      runNumber: runRequest.runNumber,
      response: response.response,
      thinking: response.thinking,
      settings: getSettings(runRequest),
      startedAt,
      finishedAt,
      elapsedMs: performance.now() - startedTime,
      totalDurationNs: response.totalDurationNs,
      loadDurationNs: response.loadDurationNs,
      promptEvalCount: response.promptEvalCount,
      promptEvalDurationNs: response.promptEvalDurationNs,
      evalCount: response.evalCount,
      evalDurationNs: response.evalDurationNs,
      promptTokensPerSecond: calculateTokensPerSecond(
        response.promptEvalCount,
        response.promptEvalDurationNs,
      ),
      outputTokensPerSecond: calculateTokensPerSecond(
        response.evalCount,
        response.evalDurationNs,
      ),
      doneReason: response.doneReason,
      error: null,
    };

    return Response.json(result);
  } catch (error) {
    const result: BenchmarkResult = {
      modelId: model.id,
      displayName: model.displayName,
      runNumber: runRequest.runNumber,
      response: "",
      thinking: "",
      settings: getSettings(runRequest),
      startedAt,
      finishedAt: new Date().toISOString(),
      elapsedMs: performance.now() - startedTime,
      totalDurationNs: null,
      loadDurationNs: null,
      promptEvalCount: null,
      promptEvalDurationNs: null,
      evalCount: null,
      evalDurationNs: null,
      promptTokensPerSecond: null,
      outputTokensPerSecond: null,
      doneReason: null,
      error: toBenchmarkError(error),
    };

    return Response.json(result);
  }
}
