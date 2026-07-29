import {
  formatDurationNs,
  formatElapsedMs,
  formatTokensPerSecond,
} from "@/lib/metrics";
import type { BenchmarkResult } from "@/types/benchmark";

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
  onDownload,
}: {
  results: BenchmarkResult[];
  onDownload: () => void;
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
        <button className="primaryButton compactButton" type="button" onClick={onDownload}>
          結果JSONをダウンロード
        </button>
      </div>
      <div className="resultsGrid">
        {results.map((result, index) => (
          <article
            className={`resultCard ${result.error ? "hasError" : ""}`}
            key={`${result.modelId}-${result.runNumber}-${index}`}
          >
            <div className="resultHeader">
              <div>
                <span className="runNumber">RUN {result.runNumber}</span>
                <h3>{result.displayName}</h3>
                <code>{result.modelId}</code>
              </div>
              <span className={`resultStatus ${result.error ? "error" : ""}`}>
                {result.error ? "エラー" : result.doneReason ?? "完了"}
              </span>
            </div>

            {result.error ? (
              <div className="errorMessage" role="alert">
                <strong>{result.error.code}</strong>
                <p>{result.error.message}</p>
              </div>
            ) : (
              <details className="responseDisclosure">
                <summary>回答本文を表示</summary>
                <pre>{result.response}</pre>
              </details>
            )}

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
