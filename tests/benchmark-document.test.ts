import assert from "node:assert/strict";
import test from "node:test";
import { createBenchmarkDocument } from "../src/lib/benchmark-document.ts";
import type {
  BenchmarkResult,
  BenchmarkSettings,
} from "../src/types/benchmark.ts";

const settings: BenchmarkSettings = {
  systemPrompt: "",
  temperature: 0,
  seed: 42,
  maxTokens: 512,
  contextLength: 4096,
  executionCount: 1,
  runMode: "warm",
  stream: false,
  think: true,
};

const result: BenchmarkResult = {
  modelId: "phi4-mini:latest",
  displayName: "Phi-4 Mini",
  runNumber: 1,
  response: "sample",
  thinking: "reasoning",
  settings,
  startedAt: "2026-07-29T12:00:00.000Z",
  finishedAt: "2026-07-29T12:00:01.000Z",
  elapsedMs: 1000,
  totalDurationNs: 1_000_000_000,
  loadDurationNs: 100_000_000,
  promptEvalCount: 10,
  promptEvalDurationNs: 100_000_000,
  evalCount: 20,
  evalDurationNs: 800_000_000,
  promptTokensPerSecond: 100,
  outputTokensPerSecond: 25,
  doneReason: "stop",
  error: null,
};

test("個人環境情報を含めずschemaVersion 1のJSON文書を作る", () => {
  const document = createBenchmarkDocument({
    createdAt: "2026-07-29T12:00:00.000Z",
    ollamaBaseUrl: "http://localhost:11434",
    prompt: "sample prompt",
    settings,
    results: [result],
  });

  assert.equal(document.schemaVersion, 1);
  assert.equal(document.results.length, 1);
  assert.equal(document.request.think, true);
  assert.equal(document.results[0].thinking, "reasoning");
  assert.equal(document.environment.platform, "");
  assert.equal(document.environment.cpu, "");
  assert.equal(
    document.benchmarkId,
    "2026-07-29T12-00-00-000Z",
  );
});
