import assert from "node:assert/strict";
import test from "node:test";
import { getPhase2Problem } from "../src/data/phase2-problems.ts";
import { scorePhase2Answer } from "../src/lib/scoring.ts";

test("客観的なJSON条件だけを自動採点し、内容評価を手動に残す", () => {
  const problem = getPhase2Problem("p2-03-strict-json");
  assert.ok(problem);
  const score = scorePhase2Answer(
    problem,
    '{"model":"Granite 4.1 8B","local":true,"strengths":["privacy","offline"]}',
  );
  assert.equal(score.automaticScore, 5);
  assert.equal(score.scoringStatus, "partial");
  assert.ok(
    score.criterionScores.some(
      (criterion) => criterion.status === "manual_required",
    ),
  );
});

test("Markdownコードフェンス付きJSONを厳密JSONとして合格させない", () => {
  const problem = getPhase2Problem("p2-03-strict-json");
  assert.ok(problem);
  const score = scorePhase2Answer(problem, '```json\n{"model":"x"}\n```');
  assert.equal(score.automaticScore, 0);
  assert.equal(score.criterionScores[0].status, "failed");
});
