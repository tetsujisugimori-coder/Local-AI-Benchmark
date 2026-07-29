import type {
  BenchmarkDocument,
  ExecutionStatus,
  MemoNexusDocument,
  ScoringStatus,
} from "../types/benchmark";

const PHASE1_FEEDBACK =
  "Phase 1では、同一プロンプトを複数モデルへ送り、回答品質だけでなく処理時間、トークン数、tokens/sec、エラーを併記することが比較に有効だった。Phase 2ではラウンドロビン実行、実行順保存、中止・失敗・未実行の区別、途中結果ダウンロードを追加した。";

export function createMemoNexusDocument(
  document: BenchmarkDocument,
): MemoNexusDocument {
  if (
    document.benchmarkMode !== "phase2" ||
    !document.problemId ||
    !document.problemTitle
  ) {
    throw new Error("Memo-Nexus形式へ変換できるのはPhase 2結果だけです。");
  }

  const criteria = document.evaluationCriteria ?? [];
  const results = document.answers ?? document.results;

  return {
    title: `Local AI Benchmark Phase 2: ${document.problemTitle}`,
    date: document.completedAt ?? document.createdAt,
    items: results.map((result) => {
      const manualReviewItems = (result.criterionScores ?? [])
        .filter((criterion) => criterion.status === "manual_required")
        .map((criterion) => criterion.label);
      const content = [
        `問題: ${document.problemTitle}`,
        `問題文:\n${document.request.prompt}`,
        `実行日時: ${result.finishedAt}`,
        `モデル: ${result.displayName} (${result.modelId})`,
        `回答:\n${result.response || "（回答なし）"}`,
        result.thinking
          ? `thinking:\n${result.thinking}`
          : "thinking: （記録なし）",
        `測定値: elapsedMs=${result.elapsedMs}, promptTokens=${result.promptEvalCount ?? "null"}, outputTokens=${result.evalCount ?? "null"}, tokens/sec=${result.outputTokensPerSecond ?? "null"}`,
        `自動採点: ${result.automaticScore ?? "未採点"}`,
        `手動採点: ${result.manualScore ?? "未採点"}`,
        `手動確認項目: ${manualReviewItems.join("、") || "なし"}`,
        `評価上の注意点: 自動採点は文字数、JSON構文、指定語など客観的条件だけを判定し、意味的な正答性や推論品質は判定しません。不要な思考ログの長さは加点しません。`,
        `評価観点: ${criteria.map((criterion) => criterion.label).join("、")}`,
        `Phase 1から得られたフィードバック: ${PHASE1_FEEDBACK}`,
      ].join("\n\n");

      return {
        title: `${document.problemTitle} — ${result.displayName} / Run ${result.runNumber}`,
        content,
        metadata: {
          problemId: document.problemId!,
          modelId: result.modelId,
          modelName: result.displayName,
          runNumber: result.runNumber,
          executionOrder: result.executionOrder ?? null,
          executionStatus:
            (result.executionStatus as ExecutionStatus | undefined) ??
            (result.error ? "failed" : "completed"),
          measurements: {
            elapsedMs: result.elapsedMs,
            promptTokens: result.promptEvalCount,
            outputTokens: result.evalCount,
            outputTokensPerSecond: result.outputTokensPerSecond,
          },
          automaticScore: result.automaticScore ?? null,
          manualScore: result.manualScore ?? null,
          scoringStatus:
            (result.scoringStatus as ScoringStatus | undefined) ?? "unscored",
          manualReviewItems,
        },
      };
    }),
    trendSummary: [
      PHASE1_FEEDBACK,
      `Phase 2問題セット ${document.problemSetVersion ?? "不明"} の「${document.problemTitle}」を${results.length}件実行。`,
      "モデル間の品質差は自動点だけで断定せず、未採点の評価観点を手動確認してください。",
    ].join(" "),
  };
}
