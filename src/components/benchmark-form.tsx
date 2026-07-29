import type { BenchmarkSettings } from "@/types/benchmark";

type NumberSetting = Exclude<
  keyof BenchmarkSettings,
  "systemPrompt" | "runMode" | "stream"
>;

export function BenchmarkForm({
  prompt,
  settings,
  disabled,
  submitDisabled,
  settingsRef,
  onPromptChange,
  onSettingsChange,
  onNumberChange,
  onSubmit,
}: {
  prompt: string;
  settings: BenchmarkSettings;
  disabled: boolean;
  submitDisabled: boolean;
  settingsRef: React.RefObject<HTMLDivElement | null>;
  onPromptChange: (value: string) => void;
  onSettingsChange: (settings: BenchmarkSettings) => void;
  onNumberChange: (key: NumberSetting, value: number) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="workspace" onSubmit={onSubmit}>
      <section className="panel promptPanel" aria-labelledby="prompt-heading">
        <p className="stepLabel">STEP 02</p>
        <h2 id="prompt-heading">共通プロンプト</h2>
        <label className="field">
          <span>すべての選択モデルへ送る内容</span>
          <textarea
            value={prompt}
            maxLength={50_000}
            rows={9}
            disabled={disabled}
            placeholder="例：ローカルAIを利用する利点を3つ、簡潔に説明してください。"
            onChange={(event) => onPromptChange(event.target.value)}
          />
          <small>{prompt.length.toLocaleString()} / 50,000文字</small>
        </label>
      </section>

      <section
        className="panel settingsPanel"
        aria-labelledby="settings-heading"
        ref={settingsRef}
        tabIndex={-1}
      >
        <p className="stepLabel">STEP 03</p>
        <h2 id="settings-heading">実行設定</h2>
        <label className="field fieldWide">
          <span>System Prompt</span>
          <textarea
            value={settings.systemPrompt}
            maxLength={20_000}
            rows={4}
            disabled={disabled}
            placeholder="任意：回答時の役割や制約"
            onChange={(event) =>
              onSettingsChange({
                ...settings,
                systemPrompt: event.target.value,
              })
            }
          />
        </label>
        <div className="settingsGrid">
          <label className="field">
            <span>Temperature</span>
            <input
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={settings.temperature}
              disabled={disabled}
              onChange={(event) =>
                onNumberChange("temperature", event.target.valueAsNumber)
              }
            />
          </label>
          <label className="field">
            <span>Seed</span>
            <input
              type="number"
              min="0"
              max="2147483647"
              step="1"
              value={settings.seed}
              disabled={disabled}
              onChange={(event) =>
                onNumberChange("seed", event.target.valueAsNumber)
              }
            />
          </label>
          <label className="field">
            <span>最大出力トークン数</span>
            <input
              type="number"
              min="1"
              max="32768"
              step="1"
              value={settings.maxTokens}
              disabled={disabled}
              onChange={(event) =>
                onNumberChange("maxTokens", event.target.valueAsNumber)
              }
            />
          </label>
          <label className="field">
            <span>コンテキスト長</span>
            <input
              type="number"
              min="128"
              max="1048576"
              step="128"
              value={settings.contextLength}
              disabled={disabled}
              onChange={(event) =>
                onNumberChange("contextLength", event.target.valueAsNumber)
              }
            />
          </label>
          <label className="field">
            <span>実行回数</span>
            <input
              type="number"
              min="1"
              max="20"
              step="1"
              value={settings.executionCount}
              disabled={disabled}
              onChange={(event) =>
                onNumberChange("executionCount", event.target.valueAsNumber)
              }
            />
          </label>
          <label className="field">
            <span>実行モード</span>
            <select
              value={settings.runMode}
              disabled={disabled}
              onChange={(event) =>
                onSettingsChange({
                  ...settings,
                  runMode: event.target.value === "cold" ? "cold" : "warm",
                })
              }
            >
              <option value="cold">コールド（各回答後にアンロード）</option>
              <option value="warm">ウォーム（モデルを5分保持）</option>
            </select>
          </label>
        </div>
        <label className="switchField">
          <input
            type="checkbox"
            checked={settings.stream}
            disabled={disabled}
            onChange={(event) =>
              onSettingsChange({ ...settings, stream: event.target.checked })
            }
          />
          <span>
            ストリーミング応答を使用
            <small>
              初期値はOFFです。ONでも比較結果は完了後にまとめて表示します。
            </small>
          </span>
        </label>
        <button
          className="primaryButton"
          type="submit"
          disabled={submitDisabled}
        >
          ベンチマーク開始
        </button>
      </section>
    </form>
  );
}
