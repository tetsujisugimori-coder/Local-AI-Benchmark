import assert from "node:assert/strict";
import test from "node:test";
import { PHASE2_PROBLEM_SET } from "../src/data/phase2-problems.ts";
import {
  createBenchmarkDocument,
  parseBenchmarkDocument,
} from "../src/lib/benchmark-document.ts";
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

test("Phase 1の旧JSONを後方互換で再読み込みする", () => {
  const oldDocument = {
    schemaVersion: 1,
    benchmarkId: "old",
    createdAt: "2026-01-01T00:00:00.000Z",
    environment: {
      ollamaBaseUrl: "http://localhost:11434",
      appVersion: "0.1.0",
      platform: "",
      cpu: "",
      memory: "",
    },
    request: {
      prompt: "old prompt",
      systemPrompt: "",
      temperature: 0,
      seed: 42,
      maxTokens: 128,
      contextLength: 4096,
      executionCount: 1,
      runMode: "warm",
      stream: false,
    },
    results: [{ ...result, thinking: undefined }],
  };

  const parsed = parseBenchmarkDocument(oldDocument);
  assert.equal(parsed.benchmarkMode, "freeform");
  assert.equal(parsed.request.think, false);
  assert.equal(parsed.results[0].thinking, "");
  assert.equal(parsed.results[0].executionStatus, "completed");
});

test("Phase 2結果に問題情報、採点状態、回答を保存する", () => {
  const problem = PHASE2_PROBLEM_SET.problems[0];
  const phase2Result: BenchmarkResult = {
    ...result,
    executionOrder: 1,
    executionStatus: "completed",
    scoringStatus: "manual_required",
    automaticScore: null,
    manualScore: null,
    criterionScores: [],
  };
  const document = createBenchmarkDocument({
    createdAt: "2026-07-30T12:00:00.000Z",
    completedAt: "2026-07-30T12:00:02.000Z",
    ollamaBaseUrl: "http://localhost:11434",
    prompt: problem.prompt,
    settings,
    results: [phase2Result],
    benchmarkMode: "phase2",
    problem,
  });

  assert.equal(document.problemSetVersion, "2.0.0");
  assert.equal(document.problemId, problem.id);
  assert.equal(document.answers?.[0].scoringStatus, "manual_required");
  assert.equal(
    parseBenchmarkDocument(JSON.parse(JSON.stringify(document))).problemTitle,
    problem.title,
  );
});
