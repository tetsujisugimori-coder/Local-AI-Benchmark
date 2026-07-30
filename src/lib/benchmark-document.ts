import type {
  BenchmarkMode,
  BenchmarkDocument,
  BenchmarkResult,
  BenchmarkSettings,
  Phase2Problem,
} from "../types/benchmark";
import { PHASE2_PROBLEM_SET } from "../data/phase2-problems.ts";

export function createBenchmarkId(createdAt: string) {
  return createdAt.replace(/[:.]/g, "-");
}

export function createBenchmarkDocument({
  createdAt,
  ollamaBaseUrl,
  prompt,
  settings,
  results,
  benchmarkMode = "freeform",
  problem,
  completedAt,
}: {
  createdAt: string;
  ollamaBaseUrl: string;
  prompt: string;
  settings: BenchmarkSettings;
  results: BenchmarkResult[];
  benchmarkMode?: BenchmarkMode;
  problem?: Phase2Problem | null;
  completedAt?: string;
}): BenchmarkDocument {
  if (benchmarkMode === "phase2" && !problem) {
    throw new Error("Phase 2結果には問題情報が必要です。");
  }

  const document: BenchmarkDocument = {
    schemaVersion: 1,
    benchmarkMode,
    benchmarkId: createBenchmarkId(createdAt),
    createdAt,
    completedAt: completedAt ?? new Date().toISOString(),
    environment: {
      ollamaBaseUrl,
      appVersion: "0.1.0",
      platform: "",
      cpu: "",
      memory: "",
    },
    request: {
      prompt,
      systemPrompt: settings.systemPrompt,
      temperature: settings.temperature,
      seed: settings.seed,
      maxTokens: settings.maxTokens,
      contextLength: settings.contextLength,
      executionCount: settings.executionCount,
      runMode: settings.runMode,
      stream: settings.stream,
      think: settings.think,
    },
    results,
  };

  if (benchmarkMode === "phase2" && problem) {
    document.problemSetId = PHASE2_PROBLEM_SET.id;
    document.problemSetVersion = PHASE2_PROBLEM_SET.version;
    document.problemId = problem.id;
    document.problemTitle = problem.title;
    document.evaluationCriteria = problem.evaluationCriteria;
    document.expectedAnswerConditions = problem.expectedAnswerConditions;
    document.answers = results;
  }

  return document;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseBenchmarkDocument(value: unknown): BenchmarkDocument {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isRecord(value.request) ||
    !Array.isArray(value.results)
  ) {
    throw new Error("schemaVersion 1のベンチマークJSONではありません。");
  }

  const candidate = value as unknown as BenchmarkDocument;
  const mode = candidate.benchmarkMode ?? "freeform";
  if (mode !== "freeform" && mode !== "phase2") {
    throw new Error("benchmarkModeが不正です。");
  }

  if (
    mode === "phase2" &&
    (!candidate.problemId ||
      !candidate.problemTitle ||
      !candidate.problemSetVersion)
  ) {
    throw new Error("Phase 2問題情報が不足しています。");
  }

  const request = {
    ...candidate.request,
    think: candidate.request.think ?? false,
  };
  const results = candidate.results.map((result) => ({
    ...result,
    thinking: result.thinking ?? "",
    executionStatus:
      result.executionStatus ??
      (result.error
        ? result.error.code === "ABORTED"
          ? "aborted"
          : "failed"
        : "completed"),
    scoringStatus: result.scoringStatus ?? "unscored",
    automaticScore: result.automaticScore ?? null,
    manualScore: result.manualScore ?? null,
  }));

  return {
    ...candidate,
    benchmarkMode: mode,
    request,
    results,
    answers: mode === "phase2" ? candidate.answers ?? results : undefined,
  };
}
