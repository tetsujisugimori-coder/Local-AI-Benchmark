import type { OllamaSetupStatus } from "@/types/benchmark";

export function AppHeader({
  status,
  loading,
  githubUrl,
  onOpenSettings,
}: {
  status: OllamaSetupStatus | null;
  loading: boolean;
  githubUrl: string;
  onOpenSettings: () => void;
}) {
  const connectionLabel = loading
    ? "確認中"
    : status?.connected
      ? `接続済み${status.version ? ` / v${status.version}` : ""}`
      : "未接続";

  return (
    <header className="appHeader">
      <div>
        <p className="eyebrow">LOCAL MODEL LAB / PHASE 1</p>
        <h1>Local AI Benchmark</h1>
        <p className="headerDescription">
          同じプロンプトをOllamaのローカルモデルへ順番に送り、回答と速度を比較します。
        </p>
      </div>
      <div className="headerControls">
        <div
          className={`connectionBadge ${status?.connected ? "isConnected" : ""}`}
          role="status"
          aria-live="polite"
        >
          <span aria-hidden="true" />
          {connectionLabel}
        </div>
        <code className="endpoint">
          {status?.baseUrl ?? "http://localhost:11434"}
        </code>
        <div className="headerActions">
          <button className="secondaryButton" type="button" onClick={onOpenSettings}>
            設定
          </button>
          {githubUrl ? (
            <a
              className="secondaryButton"
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          ) : (
            <span className="githubPlaceholder" title="環境変数で設定できます">
              GitHub URL 未設定
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
