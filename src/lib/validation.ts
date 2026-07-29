import { BENCHMARK_MODELS } from "../config/models.ts";
import type { BenchmarkRunRequest } from "../types/benchmark";

const MODEL_IDS = new Set<string>(BENCHMARK_MODELS.map((model) => model.id));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
  integer = false,
) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    (integer && !Number.isInteger(value))
  ) {
    throw new Error(
      `${name}は${minimum}から${maximum}の${integer ? "整数" : "数値"}で指定してください。`,
    );
  }

  return value;
}

export function parseBenchmarkRunRequest(value: unknown): BenchmarkRunRequest {
  if (!isRecord(value)) {
    throw new Error("リクエスト本文が不正です。");
  }

  const prompt = typeof value.prompt === "string" ? value.prompt.trim() : "";
  if (!prompt || prompt.length > 50_000) {
    throw new Error(
      "プロンプトは1文字以上、50,000文字以下で入力してください。",
    );
  }

  if (typeof value.modelId !== "string" || !MODEL_IDS.has(value.modelId)) {
    throw new Error("比較対象として登録されていないモデルです。");
  }

  const systemPrompt =
    typeof value.systemPrompt === "string" ? value.systemPrompt.trim() : "";
  if (systemPrompt.length > 20_000) {
    throw new Error("System Promptは20,000文字以下で入力してください。");
  }

  if (value.runMode !== "cold" && value.runMode !== "warm") {
    throw new Error("実行モードが不正です。");
  }

  if (typeof value.stream !== "boolean") {
    throw new Error("ストリーミング設定が不正です。");
  }

  return {
    modelId: value.modelId,
    prompt,
    systemPrompt,
    temperature: readNumber(value.temperature, "Temperature", 0, 2),
    seed: readNumber(value.seed, "Seed", 0, 2_147_483_647, true),
    maxTokens: readNumber(
      value.maxTokens,
      "最大出力トークン数",
      1,
      32_768,
      true,
    ),
    contextLength: readNumber(
      value.contextLength,
      "コンテキスト長",
      128,
      1_048_576,
      true,
    ),
    executionCount: readNumber(value.executionCount, "実行回数", 1, 20, true),
    runMode: value.runMode,
    stream: value.stream,
    runNumber: readNumber(value.runNumber, "実行番号", 1, 20, true),
  };
}
