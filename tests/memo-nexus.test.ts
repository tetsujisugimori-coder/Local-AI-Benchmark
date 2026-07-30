import assert from "node:assert/strict";
import test from "node:test";
import { PHASE2_PROBLEM_SET } from "../src/data/phase2-problems.ts";
import { createBenchmarkDocument } from "../src/lib/benchmark-document.ts";
import {
  createBenchmarkMemoExport,
  createBenchmarkMemoFilename,
} from "../src/lib/memo-nexus.ts";
import type {
  BenchmarkError,
  BenchmarkResult,
  BenchmarkSettings,
  ExecutionStatus,
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

function createResult({
  modelId,
  displayName,
  response,
  thinking = "",
  executionOrder,
  executionStatus,
  elapsedMs,
  outputTokensPerSecond,
  error = null,
}: {
  modelId: string;
  displayName: string;
  response: string;
  thinking?: string;
  executionOrder: number;
  executionStatus: ExecutionStatus;
  elapsedMs: number;
  outputTokensPerSecond: number | null;
  error?: BenchmarkError | null;
}): BenchmarkResult {
  return {
    modelId,
    displayName,
    runNumber: 1,
    response,
    thinking,
    settings,
    startedAt: `2026-07-30T00:03:2${executionOrder}.000Z`,
    finishedAt: `2026-07-30T00:03:3${executionOrder}.000Z`,
    elapsedMs,
    totalDurationNs: null,
    loadDurationNs: null,
    promptEvalCount: executionStatus === "completed" ? 106 : null,
    promptEvalDurationNs: null,
    evalCount: executionStatus === "completed" ? 114 : null,
    evalDurationNs: null,
    promptTokensPerSecond: null,
    outputTokensPerSecond,
    doneReason: executionStatus === "completed" ? "stop" : null,
    error,
    executionOrder,
    executionStatus,
    scoringStatus:
      executionStatus === "completed" ? "partial" : "unscored",
    automaticScore: executionStatus === "completed" ? 3 : null,
    manualScore: null,
    criterionScores:
      executionStatus === "completed"
        ? [
            {
              criterionId: "manual",
              label: "正答性",
              status: "manual_required",
              score: null,
              maxScore: 4,
              note: "内容判断が必要なため手動評価してください。",
            },
          ]
        : [],
  };
}

test("4モデルを1件の比較メモへまとめ、本文とmetadataに情報を保持する", () => {
  const problem = PHASE2_PROBLEM_SET.problems[0];
  const results = [
    createResult({
      modelId: "qwen3.5:latest",
      displayName: "Qwen 3.5",
      response: 'Qwen回答\n"引用"と\\バックスラッシュ',
      thinking: "Qwenの検証メモ",
      executionOrder: 1,
      executionStatus: "completed",
      elapsedMs: 13_140.0419,
      outputTokensPerSecond: 37.41122218524856,
    }),
    createResult({
      modelId: "granite4.1:8b",
      displayName: "Granite 4.1 8B",
      response: `Graniteの長い回答\n${"比較内容。".repeat(200)}`,
      executionOrder: 2,
      executionStatus: "failed",
      elapsedMs: 17_030,
      outputTokensPerSecond: null,
      error: { code: "MODEL_LOAD_FAILED", message: "モデル読込失敗" },
    }),
    createResult({
      modelId: "danielshamaei93/llama3-8b-uncensored:latest",
      displayName: "Llama 3 8B Uncensored",
      response: "Llamaの中止前回答",
      executionOrder: 3,
      executionStatus: "aborted",
      elapsedMs: 900,
      outputTokensPerSecond: null,
      error: { code: "ABORTED", message: "ユーザーが中止" },
    }),
    createResult({
      modelId: "phi4-mini:latest",
      displayName: "Phi-4 Mini",
      response: "（未実行のため回答なし）",
      executionOrder: 4,
      executionStatus: "not_run",
      elapsedMs: 0,
      outputTokensPerSecond: null,
    }),
  ];
  const benchmark = createBenchmarkDocument({
    createdAt: "2026-07-30T00:03:29.821Z",
    completedAt: "2026-07-30T00:09:40.434Z",
    ollamaBaseUrl: "http://localhost:11434",
    prompt: problem.prompt,
    settings,
    results,
    benchmarkMode: "phase2",
    problem,
  });
  const memo = createBenchmarkMemoExport(benchmark);
  const serialized = JSON.stringify(memo);
  const reloaded = JSON.parse(serialized) as typeof memo;
  const content = reloaded.items[0].content;

  assert.equal(reloaded.items.length, 1);
  assert.equal(content.split(problem.prompt).length - 1, 1);
  assert.equal(content.includes("Phase 1では"), false);
  assert.equal(serialized.split("Phase 1では").length - 1, 1);
  for (const result of results) {
    assert.match(content, new RegExp(result.displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.ok(content.includes(result.response));
  }
  assert.match(content, /Qwenの検証メモ/);
  assert.match(content, /記録なし/);
  assert.match(content, /完了/);
  assert.match(content, /失敗/);
  assert.match(content, /中止/);
  assert.match(content, /未実行/);
  assert.match(content, /未取得/);
  assert.match(content, /13\.14秒/);
  assert.match(content, /37\.41/);

  const metadata = reloaded.items[0].metadata;
  assert.equal(metadata.benchmarkId, benchmark.benchmarkId);
  assert.equal(metadata.problemId, problem.id);
  assert.equal(metadata.problemSetId, PHASE2_PROBLEM_SET.id);
  assert.equal(metadata.problemSetVersion, PHASE2_PROBLEM_SET.version);
  assert.equal(metadata.modelCount, 4);
  assert.equal(metadata.models.length, 4);
  assert.equal(metadata.models[0].measurements.elapsedMs, 13_140.0419);
  assert.equal(
    metadata.models[0].measurements.outputTokensPerSecond,
    37.41122218524856,
  );
  assert.equal(metadata.models[1].error?.code, "MODEL_LOAD_FAILED");
  assert.equal(metadata.models[2].executionStatus, "aborted");
  assert.equal(metadata.models[3].executionStatus, "not_run");
  assert.deepEqual(
    metadata.models[0].scoring.criterionScores,
    results[0].criterionScores,
  );
});

test("比較メモのファイル名に実行日時、問題ID、memo-nexusを含める", () => {
  const problem = PHASE2_PROBLEM_SET.problems[0];
  const benchmark = createBenchmarkDocument({
    createdAt: "2026-07-30T00:03:29.821Z",
    ollamaBaseUrl: "http://localhost:11434",
    prompt: problem.prompt,
    settings,
    results: [],
    benchmarkMode: "phase2",
    problem,
  });

  assert.equal(
    createBenchmarkMemoFilename(benchmark),
    "2026-07-30T00-03-29-821Z-p2-01-reasoning-verification-memo-nexus.json",
  );
});
