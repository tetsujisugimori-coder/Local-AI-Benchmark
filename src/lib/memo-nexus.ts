import type {
  BenchmarkDocument,
  BenchmarkMemoExportDocument,
  BenchmarkMemoModelExport,
  BenchmarkResult,
  ExecutionStatus,
  ScoringStatus,
} from "../types/benchmark";

const PHASE1_FEEDBACK =
  "Phase 1では、同一プロンプトを複数モデルへ送り、回答品質だけでなく処理時間、トークン数、tokens/sec、エラーを併記することが比較に有効だった。Phase 2ではラウンドロビン実行、実行順保存、中止・失敗・未実行の区別、途中結果ダウンロードを追加した。";

const STATUS_LABELS: Record<ExecutionStatus, string> = {
  completed: "完了",
  failed: "失敗",
  aborted: "中止",
  not_run: "未実行",
};

function getExecutionStatus(result: BenchmarkResult): ExecutionStatus {
  return (
    result.executionStatus ??
    (result.error
      ? result.error.code === "ABORTED"
        ? "aborted"
        : "failed"
      : "completed")
  );
}

function getScoringStatus(result: BenchmarkResult): ScoringStatus {
  return result.scoringStatus ?? "unscored";
}

function formatSeconds(elapsedMs: number | null | undefined) {
  return elapsedMs === null ||
    elapsedMs === undefined ||
    !Number.isFinite(elapsedMs)
    ? "未取得"
    : `${(elapsedMs / 1_000).toFixed(2)}秒`;
}

function formatNumber(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "未取得"
    : value.toLocaleString("ja-JP");
}

function formatRate(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "未取得"
    : value.toFixed(2);
}

function formatScore(value: number | null | undefined) {
  return value === null || value === undefined ? "未採点" : `${value}点`;
}

function escapeTableCell(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br>");
}

function createModelMetadata(result: BenchmarkResult): BenchmarkMemoModelExport {
  return {
    modelId: result.modelId,
    displayName: result.displayName,
    runNumber: result.runNumber,
    executionOrder: result.executionOrder ?? null,
    executionStatus: getExecutionStatus(result),
    response: result.response,
    thinking: result.thinking,
    error: result.error,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    measurements: {
      elapsedMs: result.elapsedMs,
      promptEvalCount: result.promptEvalCount,
      evalCount: result.evalCount,
      outputTokensPerSecond: result.outputTokensPerSecond,
      doneReason: result.doneReason,
    },
    scoring: {
      automaticScore: result.automaticScore ?? null,
      manualScore: result.manualScore ?? null,
      scoringStatus: getScoringStatus(result),
      criterionScores: result.criterionScores ?? [],
    },
  };
}

function createResultTable(results: BenchmarkResult[]) {
  const header = [
    "| 実行順 | モデル | 状態 | 処理時間 | 出力トークン | tokens/sec | 自動点 | 手動点 |",
    "|---:|---|---|---:|---:|---:|---:|---:|",
  ];
  const rows = results.map((result) => {
    const status = getExecutionStatus(result);
    return [
      result.executionOrder ?? "—",
      escapeTableCell(result.displayName),
      STATUS_LABELS[status],
      formatSeconds(result.elapsedMs),
      formatNumber(result.evalCount),
      formatRate(result.outputTokensPerSecond),
      formatScore(result.automaticScore),
      formatScore(result.manualScore),
    ].join(" | ");
  });
  return [...header, ...rows.map((row) => `| ${row} |`)].join("\n");
}

function createModelSections(results: BenchmarkResult[]) {
  return results
    .map((result) => {
      const status = getExecutionStatus(result);
      const criteria =
        result.criterionScores && result.criterionScores.length > 0
          ? result.criterionScores
              .map((criterion) => {
                const score =
                  criterion.status === "manual_required"
                    ? "手動評価"
                    : criterion.status === "not_scored"
                      ? "未採点"
                      : `${criterion.score ?? 0}/${criterion.maxScore}点`;
                return `- ${criterion.label}: ${score} — ${criterion.note}`;
              })
              .join("\n")
          : "- 未採点";
      const error = result.error
        ? `\n\n#### エラー\n\n- コード: ${result.error.code}\n- 内容: ${result.error.message}`
        : "";

      return [
        `### ${result.displayName} / Run ${result.runNumber}`,
        `- モデルID: \`${result.modelId}\``,
        `- 実行順: ${result.executionOrder ?? "未取得"}`,
        `- 状態: ${STATUS_LABELS[status]}`,
        `- done reason: ${result.doneReason ?? "未取得"}`,
        error,
        "#### 回答",
        result.response || "（回答なし）",
        "#### Thinking",
        result.thinking || "記録なし",
        "#### 評価",
        criteria,
      ]
        .filter(Boolean)
        .join("\n\n");
    })
    .join("\n\n");
}

export function createBenchmarkMemoExport(
  document: BenchmarkDocument,
): BenchmarkMemoExportDocument {
  if (
    document.benchmarkMode !== "phase2" ||
    !document.problemId ||
    !document.problemTitle
  ) {
    throw new Error("比較メモへ変換できるのはPhase 2結果だけです。");
  }

  const criteria = document.evaluationCriteria ?? [];
  const expectedConditions = document.expectedAnswerConditions ?? [];
  const results = document.answers ?? document.results;
  const comparisonMarkdown = [
    "## 問題文",
    document.request.prompt,
    "## 実行条件",
    [
      `- Temperature: ${document.request.temperature}`,
      `- Seed: ${document.request.seed}`,
      `- 最大トークン数: ${document.request.maxTokens}`,
      `- Context Length: ${document.request.contextLength}`,
      `- Run Mode: ${document.request.runMode}`,
      `- Thinking: ${document.request.think ? "ON" : "OFF"}`,
      `- 実行回数: ${document.request.executionCount}`,
    ].join("\n"),
    "## 結果一覧",
    createResultTable(results),
    "## モデル別回答",
    createModelSections(results),
    "## 評価基準",
    criteria.length > 0
      ? criteria
          .map(
            (criterion) =>
              `- ${criterion.label}: ${criterion.description}（${criterion.scoringMethod === "automatic" ? "自動判定" : "手動評価"}・${criterion.maxScore}点）`,
          )
          .join("\n")
      : "- 未設定",
    "## 期待する回答条件",
    expectedConditions.length > 0
      ? expectedConditions.map((condition) => `- ${condition}`).join("\n")
      : "- 未設定",
    "## 比較メモ",
    "自動採点は客観的な形式条件だけを対象とします。手動評価前の項目について、モデル間の正答性や品質差は確定していません。不要な思考ログの長さは加点しません。",
    "## Phase 1から得られたフィードバック",
    PHASE1_FEEDBACK,
  ].join("\n\n");

  return {
    title: `Local AI Benchmark Phase 2: ${document.problemTitle}`,
    date: document.completedAt ?? document.createdAt,
    items: [
      {
        title: document.problemTitle,
        summary: [
          `${results.length}件の実行結果を、回答、測定値、採点状態とともに比較します。`,
        ],
        metadata: {
          benchmarkId: document.benchmarkId,
          problemSetId: document.problemSetId ?? null,
          problemSetVersion: document.problemSetVersion ?? null,
          problemId: document.problemId,
          problemTitle: document.problemTitle,
          modelCount: new Set(results.map((result) => result.modelId)).size,
          evaluationCriteria: criteria,
          expectedAnswerConditions: expectedConditions,
          models: results.map(createModelMetadata),
        },
      },
    ],
    trendSummary: comparisonMarkdown,
  };
}

export function createBenchmarkMemoFilename(document: BenchmarkDocument) {
  if (!document.problemId) {
    throw new Error("比較メモのファイル名にはproblemIdが必要です。");
  }
  const timestamp = document.createdAt.replace(/[:.]/g, "-");
  const safeProblemId = document.problemId.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `${timestamp}-${safeProblemId}-memo-nexus.json`;
}
