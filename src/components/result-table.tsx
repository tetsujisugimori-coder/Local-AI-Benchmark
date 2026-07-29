import {
  formatDurationNs,
  formatElapsedMs,
  formatTokensPerSecond,
} from "@/lib/metrics";
import type { BenchmarkMode, BenchmarkResult } from "@/types/benchmark";

function Metric({
  label,
  value,
}: {
  label: string;
  value: string | number | null;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value ?? "—"}</dd>
    </div>
  );
}

export function ResultTable({
  results,
  benchmarkMode,
  onDownload,
  onDownloadMemoNexus,
  onManualScoreChange,
}: {
  results: BenchmarkResult[];
  benchmarkMode: BenchmarkMode;
  onDownload: () => void;
  onDownloadMemoNexus: () => void;
  onManualScoreChange: (index: number, score: number | null) => void;
}) {
  if (results.length === 0) {
    return null;
  }

  return (
    <section className="resultsSection" aria-labelledby="results-heading">
      <div className="sectionHeading resultsHeading">
        <div>
          <p className="stepLabel">RESULTS</p>
          <h2 id="results-heading">比較結果</h2>
        </div>
        <div className="downloadActions">
          <button
            className="primaryButton compactButton"
            type="button"
            onClick={onDownload}
          >
            結果JSON（途中結果含む）
          </button>
          {benchmarkMode === "phase2" ? (
            <button
              className="secondaryDownloadButton"
              type="button"
              onClick={onDownloadMemoNexus}
            >
              Memo-Nexus JSON
            </button>
          ) : null}
        </div>
      </div>
      <div className="resultsGrid">
        {results.map((result, index) => (
          <article
            className={`resultCard ${
              result.error || result.executionStatus === "not_run"
                ? "hasError"
                : ""
            }`}
            key={`${result.modelId}-${result.runNumber}-${index}`}
          >
            <div className="resultHeader">
              <div>
                <span className="runNumber">RUN {result.runNumber}</span>
                <h3>{result.displayName}</h3>
                <code>{result.modelId}</code>
              </div>
              <span
                className={`resultStatus ${
                  result.error || result.executionStatus === "not_run"
                    ? "error"
                    : ""
                }`}
              >
                {result.executionStatus === "not_run"
                  ? "未実行"
                  : result.executionStatus === "aborted"
                    ? "中止"
                    : result.error
                      ? "失敗"
                      : result.doneReason ?? "完了"}
              </span>
            </div>

            {result.executionStatus === "not_run" ? (
              <div className="errorMessage" role="status">
                <strong>NOT_RUN</strong>
                <p>中止後のため、この実行は開始されませんでした。</p>
              </div>
            ) : result.error ? (
              <div className="errorMessage" role="alert">
                <strong>{result.error.code}</strong>
                <p>{result.error.message}</p>
              </div>
            ) : (
              <>
                <details className="responseDisclosure">
                  <summary>回答本文を表示</summary>
                  <pre>{result.response || "（回答本文は空です）"}</pre>
                </details>
                {result.thinking ? (
                  <details className="thinkingDisclosure">
                    <summary>思考過程を表示</summary>
                    <pre>{result.thinking}</pre>
                  </details>
                ) : null}
              </>
            )}

            {benchmarkMode === "phase2" ? (
              <section className="scorePanel" aria-label="採点結果">
                <div className="scoreSummary">
                  <strong>採点</strong>
                  <span>{result.scoringStatus ?? "unscored"}</span>
                </div>
                <dl>
                  <Metric
                    label="自動採点"
                    value={
                      result.automaticScore === null ||
                      result.automaticScore === undefined
                        ? "未採点"
                        : `${result.automaticScore}点`
                    }
                  />
                  <Metric
                    label="実行順"
                    value={result.executionOrder ?? "—"}
                  />
                  <Metric
                    label="状態"
                    value={result.executionStatus ?? "completed"}
                  />
                </dl>
                {(result.criterionScores ?? []).length > 0 ? (
                  <ul className="criterionScores">
                    {result.criterionScores?.map((criterion) => (
                      <li key={criterion.criterionId}>
                        <strong>{criterion.label}</strong>
                        <span>
                          {criterion.status === "manual_required"
                            ? "手動評価"
                            : criterion.status === "passed"
                              ? `${criterion.score}/${criterion.maxScore}点`
                              : criterion.status === "failed"
                                ? `0/${criterion.maxScore}点`
                                : "未採点"}
                        </span>
                        <small>{criterion.note}</small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="unscoredNotice">
                    回答が完了していないため未採点です。
                  </p>
                )}
                {(result.criterionScores ?? []).some(
                  (criterion) => criterion.status === "manual_required",
                ) ? (
                  <label className="manualScoreField">
                    <span>手動評価の合計点（未入力可）</span>
                    <input
                      type="number"
                      min="0"
                      max={(result.criterionScores ?? [])
                        .filter(
                          (criterion) =>
                            criterion.status === "manual_required",
                        )
                        .reduce(
                          (total, criterion) =>
                            total + criterion.maxScore,
                          0,
                        )}
                      step="0.5"
                      value={result.manualScore ?? ""}
                      onChange={(event) =>
                        onManualScoreChange(
                          index,
                          event.target.value === ""
                            ? null
                            : event.target.valueAsNumber,
                        )
                      }
                    />
                  </label>
                ) : null}
              </section>
            ) : null}

            <dl className="metricsGrid">
              <Metric
                label="アプリ側経過時間"
                value={formatElapsedMs(result.elapsedMs)}
              />
              <Metric
                label="Ollama total"
                value={formatDurationNs(result.totalDurationNs)}
              />
              <Metric
                label="初回ロード時間"
                value={formatDurationNs(result.loadDurationNs)}
              />
              <Metric
                label="入力トークン"
                value={result.promptEvalCount}
              />
              <Metric
                label="入力処理時間"
                value={formatDurationNs(result.promptEvalDurationNs)}
              />
              <Metric
                label="入力処理速度"
                value={formatTokensPerSecond(result.promptTokensPerSecond)}
              />
              <Metric label="出力トークン" value={result.evalCount} />
              <Metric
                label="出力生成時間"
                value={formatDurationNs(result.evalDurationNs)}
              />
              <Metric
                label="出力生成速度"
                value={formatTokensPerSecond(result.outputTokensPerSecond)}
              />
            </dl>

            <details className="settingsDisclosure">
              <summary>実行設定と日時</summary>
              <dl>
                <Metric label="開始" value={result.startedAt} />
                <Metric label="完了" value={result.finishedAt} />
                <Metric
                  label="Temperature"
                  value={result.settings.temperature}
                />
                <Metric label="Seed" value={result.settings.seed} />
                <Metric
                  label="最大出力"
                  value={result.settings.maxTokens}
                />
                <Metric
                  label="コンテキスト長"
                  value={result.settings.contextLength}
                />
                <Metric
                  label="実行モード"
                  value={result.settings.runMode}
                />
                <Metric
                  label="ストリーミング"
                  value={result.settings.stream ? "ON" : "OFF"}
                />
                <Metric
                  label="思考モード"
                  value={result.settings.think ? "ON" : "OFF"}
                />
              </dl>
              {result.settings.systemPrompt ? (
                <p className="systemPrompt">
                  <strong>System Prompt</strong>
                  {result.settings.systemPrompt}
                </p>
              ) : null}
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}
