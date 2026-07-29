import assert from "node:assert/strict";
import test from "node:test";
import { PHASE2_PROBLEM_SET } from "../src/data/phase2-problems.ts";
import { createBenchmarkDocument } from "../src/lib/benchmark-document.ts";
import { createMemoNexusDocument } from "../src/lib/memo-nexus.ts";
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

test("Phase 2結果を改行と引用符を保ったMemo-Nexus JSONへ変換する", () => {
  const problem = PHASE2_PROBLEM_SET.problems[0];
  const result: BenchmarkResult = {
    modelId: "phi4-mini:latest",
    displayName: "Phi-4 Mini",
    runNumber: 1,
    response: '1行目\n"引用"を含む2行目',
    thinking: "検証メモ",
    settings,
    startedAt: "2026-07-30T12:00:00.000Z",
    finishedAt: "2026-07-30T12:00:01.000Z",
    elapsedMs: 1000,
    totalDurationNs: null,
    loadDurationNs: null,
    promptEvalCount: 10,
    promptEvalDurationNs: null,
    evalCount: 20,
    evalDurationNs: null,
    promptTokensPerSecond: null,
    outputTokensPerSecond: 20,
    doneReason: "stop",
    error: null,
    executionOrder: 1,
    executionStatus: "completed",
    scoringStatus: "manual_required",
    automaticScore: null,
    manualScore: null,
    criterionScores: [
      {
        criterionId: "manual",
        label: "正答性",
        status: "manual_required",
        score: null,
        maxScore: 10,
        note: "手動評価",
      },
    ],
  };
  const benchmark = createBenchmarkDocument({
    createdAt: "2026-07-30T12:00:00.000Z",
    ollamaBaseUrl: "http://localhost:11434",
    prompt: problem.prompt,
    settings,
    results: [result],
    benchmarkMode: "phase2",
    problem,
  });
  const memo = createMemoNexusDocument(benchmark);
  const reloaded = JSON.parse(JSON.stringify(memo)) as typeof memo;

  assert.equal(reloaded.items.length, 1);
  assert.match(reloaded.items[0].content, /1行目\n"引用"/);
  assert.deepEqual(reloaded.items[0].metadata.manualReviewItems, ["正答性"]);
  assert.match(reloaded.trendSummary, /Phase 1/);
});
