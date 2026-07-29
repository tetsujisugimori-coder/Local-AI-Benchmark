import type {
  CriterionScore,
  Phase2Problem,
  ScoringStatus,
} from "../types/benchmark";

function scoreStrictJson(
  response: string,
  requiredKeys: string[],
  allowAdditionalKeys: boolean,
) {
  try {
    const parsed = JSON.parse(response) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return false;
    }
    const keys = Object.keys(parsed);
    const hasRequiredKeys = requiredKeys.every((key) => keys.includes(key));
    return (
      hasRequiredKeys &&
      (allowAdditionalKeys || keys.length === requiredKeys.length)
    );
  } catch {
    return false;
  }
}

export function scorePhase2Answer(problem: Phase2Problem, response: string) {
  const criterionScores: CriterionScore[] = problem.evaluationCriteria.map(
    (criterion) => {
      if (
        criterion.scoringMethod === "manual" ||
        !criterion.automaticRule
      ) {
        return {
          criterionId: criterion.id,
          label: criterion.label,
          status: "manual_required",
          score: null,
          maxScore: criterion.maxScore,
          note: "内容判断が必要なため手動評価してください。",
        };
      }

      const rule = criterion.automaticRule;
      let passed = false;
      let note = "";
      if (rule.type === "max_characters") {
        passed = response.length > 0 && response.length <= rule.maximum;
        note = `${response.length}文字 / 上限${rule.maximum}文字`;
      } else if (rule.type === "strict_json") {
        passed = scoreStrictJson(
          response,
          rule.requiredKeys,
          rule.allowAdditionalKeys,
        );
        note = passed
          ? "JSON構文とキー構成を確認しました。値の意味は手動評価対象です。"
          : "JSON構文またはキー構成が指定と一致しません。";
      } else {
        const missing = rule.phrases.filter(
          (phrase) => !response.includes(phrase),
        );
        passed = missing.length === 0;
        note = passed
          ? "指定語を確認しました。文脈上の正しさは手動評価対象です。"
          : `不足している指定語: ${missing.join("、")}`;
      }

      return {
        criterionId: criterion.id,
        label: criterion.label,
        status: passed ? "passed" : "failed",
        score: passed ? criterion.maxScore : 0,
        maxScore: criterion.maxScore,
        note,
      };
    },
  );

  const automaticScore = criterionScores
    .filter((criterion) => criterion.score !== null)
    .reduce((total, criterion) => total + (criterion.score ?? 0), 0);
  const hasAutomatic = criterionScores.some(
    (criterion) => criterion.score !== null,
  );
  const hasManual = criterionScores.some(
    (criterion) => criterion.status === "manual_required",
  );
  const scoringStatus: ScoringStatus =
    hasAutomatic && hasManual
      ? "partial"
      : hasAutomatic
        ? "automatic"
        : hasManual
          ? "manual_required"
          : "unscored";

  return {
    criterionScores,
    automaticScore: hasAutomatic ? automaticScore : null,
    manualScore: null,
    scoringStatus,
  };
}
