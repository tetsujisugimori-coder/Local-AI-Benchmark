import type { BenchmarkProgress } from "@/types/benchmark";

export function ProgressPanel({
  progress,
  running,
  onCancel,
}: {
  progress: BenchmarkProgress;
  running: boolean;
  onCancel: () => void;
}) {
  if (!running && progress.total === 0) {
    return null;
  }

  const percent =
    progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;

  return (
    <section className="panel progressPanel" aria-labelledby="progress-heading">
      <div className="sectionHeading">
        <div>
          <p className="stepLabel">RUN STATUS</p>
          <h2 id="progress-heading">
            {running ? "ベンチマーク実行中" : "ベンチマーク完了"}
          </h2>
        </div>
        {running ? (
          <button className="dangerButton" type="button" onClick={onCancel}>
            中止
          </button>
        ) : null}
      </div>
      <div className="progressSummary" aria-live="polite">
        <strong>{progress.currentModel ?? "すべての実行が完了しました"}</strong>
        <span>
          {progress.completed} / {progress.total} · {percent}%
        </span>
      </div>
      <progress value={progress.completed} max={Math.max(progress.total, 1)}>
        {percent}%
      </progress>
      <div className="statusColumns">
        <div>
          <h3>完了</h3>
          <ul>
            {progress.completedModels.length > 0 ? (
              progress.completedModels.map((name, index) => (
                <li key={`${name}-${index}`}>{name}</li>
              ))
            ) : (
              <li>まだありません</li>
            )}
          </ul>
        </div>
        <div>
          <h3>エラー</h3>
          <ul>
            {progress.failedModels.length > 0 ? (
              progress.failedModels.map((name, index) => (
                <li key={`${name}-${index}`}>{name}</li>
              ))
            ) : (
              <li>なし</li>
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}
