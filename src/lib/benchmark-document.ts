import type {
  BenchmarkDocument,
  BenchmarkResult,
  BenchmarkSettings,
} from "../types/benchmark";

export function createBenchmarkId(createdAt: string) {
  return createdAt.replace(/[:.]/g, "-");
}

export function createBenchmarkDocument({
  createdAt,
  ollamaBaseUrl,
  prompt,
  settings,
  results,
}: {
  createdAt: string;
  ollamaBaseUrl: string;
  prompt: string;
  settings: BenchmarkSettings;
  results: BenchmarkResult[];
}): BenchmarkDocument {
  return {
    schemaVersion: 1,
    benchmarkId: createBenchmarkId(createdAt),
    createdAt,
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
}
