import { PHASE2_PROBLEM_SET } from "@/data/phase2-problems";
import type { BenchmarkMode, Phase2Problem } from "@/types/benchmark";

export function ProblemSelector({
  mode,
  problem,
  disabled,
  onModeChange,
  onProblemChange,
}: {
  mode: BenchmarkMode;
  problem: Phase2Problem;
  disabled: boolean;
  onModeChange: (mode: BenchmarkMode) => void;
  onProblemChange: (problemId: string) => void;
}) {
  return (
    <section className="panel modePanel" aria-labelledby="mode-heading">
      <p className="stepLabel">BENCHMARK MODE</p>
      <h2 id="mode-heading">ベンチマーク方式</h2>
      <div className="modeOptions">
        <label>
          <input
            type="radio"
            name="benchmark-mode"
            value="freeform"
            checked={mode === "freeform"}
            disabled={disabled}
            onChange={() => onModeChange("freeform")}
          />
          <span>
            <strong>自由入力</strong>
            <small>Phase 1互換の共通プロンプトで比較します。</small>
          </span>
        </label>
        <label>
          <input
            type="radio"
            name="benchmark-mode"
            value="phase2"
            checked={mode === "phase2"}
            disabled={disabled}
            onChange={() => onModeChange("phase2")}
          />
          <span>
            <strong>Phase 2問題セット</strong>
            <small>版管理された問題と評価観点を使います。</small>
          </span>
        </label>
      </div>

      {mode === "phase2" ? (
        <div className="problemDetails">
          <label className="field">
            <span>問題を選択</span>
            <select
              value={problem.id}
              disabled={disabled}
              onChange={(event) => onProblemChange(event.target.value)}
            >
              {PHASE2_PROBLEM_SET.problems.map((item, index) => (
                <option key={item.id} value={item.id}>
                  {index + 1}. {item.title}
                </option>
              ))}
            </select>
          </label>
          <div className="problemMeta">
            <span>問題ID: {problem.id}</span>
            <span>
              セット: {PHASE2_PROBLEM_SET.id} / v
              {PHASE2_PROBLEM_SET.version}
            </span>
          </div>
          <h3>{problem.title}</h3>
          <pre className="problemPrompt">{problem.prompt}</pre>
          <div className="criteriaGrid">
            <div>
              <h4>評価観点</h4>
              <ul>
                {problem.evaluationCriteria.map((criterion) => (
                  <li key={criterion.id}>
                    <strong>{criterion.label}</strong>（
                    {criterion.scoringMethod === "automatic"
                      ? "自動判定"
                      : "手動評価"}
                    ・{criterion.maxScore}点）: {criterion.description}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4>期待する回答の条件</h4>
              <ul>
                {problem.expectedAnswerConditions.map((condition) => (
                  <li key={condition}>{condition}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="scoringNotice">
            自動採点は文字数・JSON構文・指定語などの客観条件に限定します。意味的な正答性、推論の確認可能性、曖昧さへの対応は「手動評価」として保存され、思考ログの長さは加点されません。
          </p>
        </div>
      ) : null}
    </section>
  );
}
