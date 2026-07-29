import assert from "node:assert/strict";
import test from "node:test";
import { PHASE2_PROBLEM_SET } from "../src/data/phase2-problems.ts";

test("Phase 2問題セットは版管理された8問と評価定義を持つ", () => {
  assert.equal(PHASE2_PROBLEM_SET.version, "2.0.0");
  assert.equal(PHASE2_PROBLEM_SET.problems.length, 8);
  assert.equal(
    new Set(PHASE2_PROBLEM_SET.problems.map((problem) => problem.id)).size,
    8,
  );

  for (const problem of PHASE2_PROBLEM_SET.problems) {
    assert.ok(problem.id);
    assert.ok(problem.title);
    assert.ok(problem.prompt.length >= 50);
    assert.ok(problem.version);
    assert.ok(problem.evaluationCriteria.length > 0);
    assert.ok(problem.expectedAnswerConditions.length > 0);
    for (const criterion of problem.evaluationCriteria) {
      assert.ok(criterion.maxScore > 0);
      if (criterion.scoringMethod === "automatic") {
        assert.ok(criterion.automaticRule);
      }
    }
  }
});
