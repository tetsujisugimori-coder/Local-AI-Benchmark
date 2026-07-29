import assert from "node:assert/strict";
import test from "node:test";
import {
  createExecutionPlan,
  runSequentially,
} from "../src/lib/sequential-runner.ts";

test("モデルをラウンドロビン順に並べた実行計画を作る", () => {
  assert.deepEqual(createExecutionPlan(["model-a", "model-b"], 2), [
    { modelId: "model-a", runNumber: 1 },
    { modelId: "model-b", runNumber: 1 },
    { modelId: "model-a", runNumber: 2 },
    { modelId: "model-b", runNumber: 2 },
  ]);
});

test("1モデルがエラー結果でも残りを順番に実行する", async () => {
  const calls: string[] = [];
  const reported: string[] = [];
  const tasks = createExecutionPlan(["failed-model", "next-model"], 1);

  const results = await runSequentially(
    tasks,
    async (task) => {
      calls.push(task.modelId);
      return {
        modelId: task.modelId,
        error: task.modelId === "failed-model" ? "load failed" : null,
      };
    },
    {
      shouldStop: () => false,
      onResult: (result) => {
        reported.push(`${result.modelId}:${result.error ?? "ok"}`);
      },
    },
  );

  assert.deepEqual(calls, ["failed-model", "next-model"]);
  assert.equal(results.length, 2);
  assert.deepEqual(reported, [
    "failed-model:load failed",
    "next-model:ok",
  ]);
});

test("中止条件が成立した後は残りを実行しない", async () => {
  let stopped = false;
  const calls: string[] = [];

  await runSequentially(
    createExecutionPlan(["model-a", "model-b"], 1),
    async (task) => {
      calls.push(task.modelId);
      return task.modelId;
    },
    {
      shouldStop: () => stopped,
      onResult: () => {
        stopped = true;
      },
    },
  );

  assert.deepEqual(calls, ["model-a"]);
});
