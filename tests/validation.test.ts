import assert from "node:assert/strict";
import test from "node:test";
import { PHASE2_PROBLEM_SET } from "../src/data/phase2-problems.ts";
import { parseBenchmarkRunRequest } from "../src/lib/validation.ts";

const validRequest = {
  modelId: "phi4-mini:latest",
  prompt: " 同じ質問 ",
  systemPrompt: "",
  temperature: 0,
  seed: 42,
  maxTokens: 512,
  contextLength: 4096,
  executionCount: 1,
  runMode: "warm",
  stream: false,
  think: false,
  runNumber: 1,
};

test("有効な実行リクエストを正規化する", () => {
  const parsed = parseBenchmarkRunRequest(validRequest);
  assert.equal(parsed.prompt, "同じ質問");
  assert.equal(parsed.modelId, "phi4-mini:latest");
  assert.equal(parsed.stream, false);
  assert.equal(parsed.think, false);
});

test("think未指定時は思考モードをOFFにする", () => {
  const requestWithoutThink: Record<string, unknown> = { ...validRequest };
  delete requestWithoutThink.think;
  assert.equal(parseBenchmarkRunRequest(requestWithoutThink).think, false);
});

test("登録外モデルと範囲外設定を拒否する", () => {
  assert.throws(
    () =>
      parseBenchmarkRunRequest({
        ...validRequest,
        modelId: "unknown:latest",
      }),
    /登録されていないモデル/,
  );
  assert.throws(
    () => parseBenchmarkRunRequest({ ...validRequest, temperature: 3 }),
    /Temperature/,
  );
});

test("空のプロンプトを拒否する", () => {
  assert.throws(
    () => parseBenchmarkRunRequest({ ...validRequest, prompt: "  " }),
    /プロンプト/,
  );
});

test("runNumberがexecutionCountを超えるリクエストを拒否する", () => {
  assert.throws(
    () =>
      parseBenchmarkRunRequest({
        ...validRequest,
        executionCount: 1,
        runNumber: 2,
      }),
    /実行番号は実行回数以下/,
  );
});

test("Phase 2問題選択を検証し、不正なproblemIdを拒否する", () => {
  const problem = PHASE2_PROBLEM_SET.problems[0];
  const parsed = parseBenchmarkRunRequest({
    ...validRequest,
    benchmarkMode: "phase2",
    problemId: problem.id,
    prompt: problem.prompt,
    executionOrder: 3,
  });
  assert.equal(parsed.problemId, problem.id);
  assert.equal(parsed.executionOrder, 3);

  assert.throws(
    () =>
      parseBenchmarkRunRequest({
        ...validRequest,
        benchmarkMode: "phase2",
        problemId: "missing-problem",
      }),
    /登録されていないPhase 2問題/,
  );
});
