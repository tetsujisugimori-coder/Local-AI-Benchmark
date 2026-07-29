import { formatBytes } from "@/lib/metrics";
import type { ModelAvailability } from "@/types/benchmark";

export function ModelSelector({
  models,
  selectedIds,
  disabled,
  onToggle,
  onRefresh,
}: {
  models: ModelAvailability[];
  selectedIds: string[];
  disabled: boolean;
  onToggle: (modelId: string) => void;
  onRefresh: () => void;
}) {
  return (
    <section className="panel" aria-labelledby="models-heading">
      <div className="sectionHeading">
        <div>
          <p className="stepLabel">STEP 01</p>
          <h2 id="models-heading">比較するモデル</h2>
        </div>
        <button
          className="textButton"
          type="button"
          disabled={disabled}
          onClick={onRefresh}
        >
          接続状態を再確認
        </button>
      </div>
      <p id="models-help" className="sectionIntro">
        インストール済みのモデルだけを選択できます。モデルのダウンロードは自動実行しません。
      </p>
      <div className="modelGrid" aria-describedby="models-help">
        {models.map((model) => {
          const selected = selectedIds.includes(model.id);
          return (
            <label
              className={`modelCard ${selected ? "isSelected" : ""} ${
                !model.available ? "isUnavailable" : ""
              }`}
              key={model.id}
            >
              <span className="modelCardTop">
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={disabled || !model.available}
                  onChange={() => onToggle(model.id)}
                />
                <span
                  className={`availability ${
                    model.available ? "available" : "missing"
                  }`}
                >
                  {model.available ? "利用可能" : "未インストール"}
                </span>
              </span>
              <strong>{model.displayName}</strong>
              <code>{model.id}</code>
              <span className="modelMeta">
                <span>{model.parameterSize ?? model.family}</span>
                <span>{formatBytes(model.size)}</span>
              </span>
              <span className="modelUpdated">
                更新日時:{" "}
                {model.modifiedAt
                  ? new Date(model.modifiedAt).toLocaleString("ja-JP")
                  : "—"}
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}
