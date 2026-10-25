"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  PublicBenchmarkDocument,
  PublicBenchmarkExperiment,
} from "../../src/types/public-benchmark.ts";
import {
  assessComparability,
  MAX_BENCHMARK_BYTES,
  MAX_MANIFEST_BYTES,
  observationText,
  safeExternalHref,
  validateCatalog,
  verifyBenchmarkPair,
  type BenchmarkSource,
  type CatalogEntry,
} from "../src/lib/viewer-data.ts";

const BASE_PATH = process.env.NEXT_PUBLIC_VIEWER_BASE_PATH ?? "";
const MAX_TEMPORARY_EXPERIMENTS = 100;

type Filters = {
  model: string;
  agent: string;
  date: string;
  task: string;
  protocol: string;
  execution: string;
  scoring: string;
  contamination: string;
};

const EMPTY_FILTERS: Filters = {
  model: "",
  agent: "",
  date: "",
  task: "",
  protocol: "",
  execution: "",
  scoring: "",
  contamination: "",
};

function matchesFilter(value: string, filter: string): boolean {
  return value.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase());
}

function observed<T>(value: { status: string; value?: T }): T | null {
  return value.status === "observed" ? (value.value ?? null) : null;
}

function display<T>(
  value: { status: string; value?: T; reason?: string },
  render?: (item: T) => string,
): string {
  if (value.status === "observed" && value.value !== undefined) {
    return render ? render(value.value) : String(value.value);
  }
  return value.status === "not_applicable"
    ? `非該当: ${value.reason ?? "理由の記録なし"}`
    : `未観測／非公開: ${value.reason ?? "理由の記録なし"}`;
}

function filterRecord(
  record: BenchmarkSource,
  filters: Filters,
): boolean {
  const experiment = record.experiment;
  const modelName =
    experiment.model.name.status === "observed"
      ? experiment.model.name.value
      : "";
  const taskName = [
    experiment.task.id.status === "observed"
      ? experiment.task.id.value
      : "",
    experiment.task.title.status === "observed"
      ? experiment.task.title.value
      : "",
    experiment.task.setVersion.status === "observed"
      ? experiment.task.setVersion.value
      : "",
  ].join(" ");
  const protocol = [
    experiment.evaluation.protocolId.status === "observed"
      ? experiment.evaluation.protocolId.value
      : "",
    experiment.evaluation.protocolVersion.status === "observed"
      ? experiment.evaluation.protocolVersion.value
      : "",
  ].join(" ");
  const startedAt =
    experiment.time.startedAt.status === "observed"
      ? experiment.time.startedAt.value
      : "";
  return (
    matchesFilter(modelName, filters.model) &&
    matchesFilter(experiment.agent.name, filters.agent) &&
    matchesFilter(startedAt, filters.date) &&
    matchesFilter(taskName, filters.task) &&
    matchesFilter(protocol, filters.protocol) &&
    matchesFilter(experiment.execution.status, filters.execution) &&
    matchesFilter(experiment.execution.scoringStatus, filters.scoring) &&
    matchesFilter(experiment.contamination.status, filters.contamination)
  );
}

function dataKindLabel(kind: PublicBenchmarkDocument["dataKind"]): string {
  return kind === "synthetic_sample" ? "合成サンプル（実測ではありません）" : "利用者記録（独立検証なし）";
}

function executionLabel(experiment: PublicBenchmarkExperiment): string {
  return `${experiment.execution.status} / ${experiment.execution.taskOutcome}`;
}

function sourceList(
  documents: Array<{
    key: string;
    label: string;
    dataKind: PublicBenchmarkDocument["dataKind"];
    registration: "catalog" | "temporary";
    document: PublicBenchmarkDocument;
    warnings: string[];
  }>,
): BenchmarkSource[] {
  return documents.flatMap((source) =>
    source.document.experiments.map((experiment) => ({
      key: `${source.key}:${experiment.id}`,
      label: source.label,
      dataKind: source.dataKind,
      experiment,
      integrity: "verified" as const,
      registration: source.registration,
      warnings: source.warnings,
    })),
  );
}

async function loadCatalogEntry(entry: CatalogEntry): Promise<{
  key: string;
  label: string;
  dataKind: PublicBenchmarkDocument["dataKind"];
  registration: "catalog";
  document: PublicBenchmarkDocument;
  warnings: string[];
}> {
  const prefix = `${BASE_PATH}/`;
  const [jsonResponse, manifestResponse] = await Promise.all([
    fetch(`${prefix}${entry.dataFile}`, { cache: "no-store" }),
    fetch(`${prefix}${entry.manifestFile}`, { cache: "no-store" }),
  ]);
  if (!jsonResponse.ok || !manifestResponse.ok) {
    throw new Error(`カタログ項目 ${entry.id} のファイルを取得できません。`);
  }
  const [jsonBytes, manifestBytes] = await Promise.all([
    readResponseBytes(jsonResponse, MAX_BENCHMARK_BYTES, "公開JSON"),
    readResponseBytes(manifestResponse, MAX_MANIFEST_BYTES, "manifest"),
  ]);
  const verified = await verifyBenchmarkPair({
    jsonBytes,
    manifestBytes,
    expectedDataKind: entry.dataKind,
  });
  return {
    key: `catalog:${entry.id}`,
    label: `カタログ: ${entry.id}`,
    dataKind: verified.document.dataKind,
    registration: "catalog",
    document: verified.document,
    warnings: verified.warnings,
  };
}

async function readResponseBytes(
  response: Response,
  limit: number,
  label: string,
): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new Error(`${label}がサイズ上限を超えています。`);
  }
  if (!response.body) throw new Error(`${label}を読み込めません。`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new Error(`${label}がサイズ上限を超えています。`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function BenchmarkViewer() {
  const [documents, setDocuments] = useState<
    Array<{
      key: string;
      label: string;
      dataKind: PublicBenchmarkDocument["dataKind"];
      registration: "catalog" | "temporary";
      document: PublicBenchmarkDocument;
      warnings: string[];
    }>
  >([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selected, setSelected] = useState<string[]>([]);
  const [catalogStatus, setCatalogStatus] = useState("カタログを検証しています。");
  const [catalogError, setCatalogError] = useState("");
  const [uploadJson, setUploadJson] = useState<File | null>(null);
  const [uploadManifest, setUploadManifest] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`${BASE_PATH}/catalog/v1.json`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("カタログファイルを取得できません。");
        const bytes = await readResponseBytes(response, 512 * 1024, "カタログ");
        const catalog: unknown = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        );
        validateCatalog(catalog);
        const loaded = await Promise.all(catalog.entries.map(loadCatalogEntry));
        const ids = loaded.flatMap((item) =>
          item.document.experiments.map((experiment) => experiment.id),
        );
        if (new Set(ids).size !== ids.length) {
          throw new Error("カタログ内で実験IDが重複しています。");
        }
        if (active) {
          setDocuments(loaded);
          setCatalogStatus(
            `${loaded.length}件のカタログデータを形式・manifest検証しました。`,
          );
          setCatalogError("");
        }
      } catch (error) {
        if (active) {
          setDocuments([]);
          setCatalogStatus("カタログを読み込めませんでした。");
          setCatalogError(
            error instanceof Error ? error.message : "不明な検証エラーです。",
          );
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const records = useMemo(() => sourceList(documents), [documents]);
  const visibleRecords = useMemo(
    () => records.filter((record) => filterRecord(record, filters)),
    [records, filters],
  );
  const selectedRecords = records.filter((record) =>
    selected.includes(record.key),
  );
  const comparison = useMemo(
    () => assessComparability(selectedRecords.map((record) => record.experiment)),
    [selectedRecords],
  );

  const updateFilter = (key: keyof Filters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));

  const toggleSelected = (key: string, checked: boolean) => {
    setSelected((current) => {
      if (!checked) return current.filter((item) => item !== key);
      if (current.length >= 4) return current;
      return [...current, key];
    });
  };

  const validateTemporaryPair = async () => {
    setUploadError("");
    setUploading(true);
    setSelected([]);
    setDocuments((current) =>
      current.filter((item) => item.registration !== "temporary"),
    );
    try {
      if (!uploadJson || !uploadManifest) {
        throw new Error("公開JSONとmanifestの両方を選択してください。");
      }
      if (!uploadJson.name.toLowerCase().endsWith(".json")) {
        throw new Error("公開JSONファイルの拡張子を確認してください。");
      }
      if (!uploadManifest.name.toLowerCase().endsWith(".json")) {
        throw new Error("manifestファイルの拡張子を確認してください。");
      }
      if (uploadJson.size > MAX_BENCHMARK_BYTES) {
        throw new Error("公開JSONは2 MiB以下である必要があります。");
      }
      if (uploadManifest.size > MAX_MANIFEST_BYTES) {
        throw new Error("manifestは32 KiB以下である必要があります。");
      }
      const [jsonBytes, manifestBytes] = await Promise.all([
        uploadJson.arrayBuffer(),
        uploadManifest.arrayBuffer(),
      ]);
      const verified = await verifyBenchmarkPair({
        jsonBytes: new Uint8Array(jsonBytes),
        manifestBytes: new Uint8Array(manifestBytes),
      });
      const oldIds = new Set(
        records.flatMap((record) => record.experiment.id),
      );
      if (
        verified.document.experiments.some((experiment) =>
          oldIds.has(experiment.id),
        )
      ) {
        throw new Error("既存表示データと実験IDが重複しています。");
      }
      if (verified.document.experiments.length > MAX_TEMPORARY_EXPERIMENTS) {
        throw new Error("一時読込は1ファイル100実験までです。");
      }
      setDocuments((current) => [
        ...current.filter((item) => item.registration !== "temporary"),
        {
          key: `temporary:${crypto.randomUUID()}`,
          label: `一時読込: ${uploadJson.name}`,
          dataKind: verified.document.dataKind,
          registration: "temporary",
          document: verified.document,
          warnings: verified.warnings,
        },
      ]);
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "公開データを検証できません。",
      );
    } finally {
      setUploading(false);
    }
  };

  const removeTemporary = () => {
    setDocuments((current) =>
      current.filter((item) => item.registration !== "temporary"),
    );
    setSelected([]);
    setUploadJson(null);
    setUploadManifest(null);
    setUploadError("");
  };

  return (
    <main className="page">
      <header className="masthead">
        <p className="small">LOCAL-AI-BENCHMARK / PUBLIC DATA</p>
        <h1>公開ベンチマークビューア</h1>
        <p>
          人間がレビューした公開JSONを検証し、閲覧・検索・条件を確認した比較を行う静的ビューアです。
          Ollama API、実行API、外部アップロードには接続しません。
        </p>
      </header>

      <aside className="notice" aria-labelledby="trust-title">
        <h2 id="trust-title">検証と信頼性について</h2>
        <p>{catalogStatus}</p>
        {catalogError ? <p className="error" role="alert">{catalogError}</p> : null}
        <ul className="plainList">
          <li>形式検証とmanifest一致は、データの真正性・実験の正確性・独立検証を証明しません。</li>
          <li>SHA-256は提示されたJSONとmanifestのバイト同一性確認だけに使います。両方を変更できる場合は真正性を保証しません。</li>
          <li>「情報汚染なし検出」は汚染が絶対にない証拠ではありません。unknownは不明のまま表示します。</li>
          <li>合成サンプルは実測値ではなく、性能比較の証拠ではありません。</li>
        </ul>
      </aside>

      <section className="panel" aria-labelledby="temporary-title">
        <h2 id="temporary-title">ブラウザ内で一時読込</h2>
        <p>
          JSONとmanifestを選択して検証します。ファイルはブラウザ内のメモリにのみ保持され、
          自動送信・永続保存は行いません。
        </p>
        <div className="uploadFields">
          <label>
            benchmark-public/v1 JSON（最大2 MiB）
            <input
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                setUploadJson(event.currentTarget.files?.[0] ?? null);
                setUploadError("");
                setDocuments((current) =>
                  current.filter((item) => item.registration !== "temporary"),
                );
                setSelected([]);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <label>
            benchmark-public-manifest/v1 JSON（最大32 KiB）
            <input
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                setUploadManifest(event.currentTarget.files?.[0] ?? null);
                setUploadError("");
                setDocuments((current) =>
                  current.filter((item) => item.registration !== "temporary"),
                );
                setSelected([]);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <button type="button" onClick={() => void validateTemporaryPair()} disabled={uploading}>
            {uploading ? "検証中…" : "JSONとmanifestを検証"}
          </button>
          <button
            type="button"
            onClick={removeTemporary}
            disabled={!documents.some((item) => item.registration === "temporary")}
          >
            一時データを削除
          </button>
        </div>
        {uploadError ? <p className="error" role="alert">{uploadError}</p> : null}
      </section>

      <section className="panel" aria-labelledby="filter-title">
        <h2 id="filter-title">公開データ一覧</h2>
        <div className="filters">
          <Filter label="モデル名" value={filters.model} onChange={(v) => updateFilter("model", v)} />
          <Filter label="エージェント名" value={filters.agent} onChange={(v) => updateFilter("agent", v)} />
          <Filter label="実行日時" value={filters.date} onChange={(v) => updateFilter("date", v)} />
          <Filter label="課題ID・タイトル・版" value={filters.task} onChange={(v) => updateFilter("task", v)} />
          <Filter label="評価規約・版" value={filters.protocol} onChange={(v) => updateFilter("protocol", v)} />
          <Filter label="実行状態" value={filters.execution} onChange={(v) => updateFilter("execution", v)} />
          <Filter label="採点状態" value={filters.scoring} onChange={(v) => updateFilter("scoring", v)} />
          <label>
            情報汚染状態
            <select
              value={filters.contamination}
              onChange={(event) => updateFilter("contamination", event.currentTarget.value)}
            >
              <option value="">すべて</option>
              <option value="none_detected">none_detected</option>
              <option value="present">present</option>
              <option value="unknown">unknown</option>
            </select>
          </label>
          <button type="button" onClick={() => setFilters(EMPTY_FILTERS)}>絞り込みをクリア</button>
        </div>
        <p role="status">{visibleRecords.length} / {records.length} 件表示。比較対象は最大4件です。</p>
        {visibleRecords.length === 0 ? (
          <p className="muted">条件に一致する公開データはありません。</p>
        ) : (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">比較</th>
                  <th scope="col">実験 / 種別</th>
                  <th scope="col">モデル / エージェント</th>
                  <th scope="col">課題 / 規約</th>
                  <th scope="col">状態</th>
                  <th scope="col">汚染</th>
                </tr>
              </thead>
              <tbody>
                {visibleRecords.map((record) => (
                  <tr key={record.key}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`比較に選択: ${record.experiment.id}`}
                        checked={selected.includes(record.key)}
                        disabled={!selected.includes(record.key) && selected.length >= 4}
                        onChange={(event) => toggleSelected(record.key, event.currentTarget.checked)}
                      />
                    </td>
                    <td>
                      <a href={`#${encodeURIComponent(record.experiment.id)}`}>
                        {record.experiment.id}
                      </a>
                      <br />
                      <span className={`badge ${record.dataKind === "synthetic_sample" ? "synthetic" : "userRecorded"}`}>
                        {dataKindLabel(record.dataKind)}
                      </span>
                      <br />
                      <span className="small">{display(record.experiment.time.startedAt)}</span>
                    </td>
                    <td>
                      {display(record.experiment.model.name)}
                      <br />
                      <span className="small">{record.experiment.agent.name} ({record.experiment.agent.interface})</span>
                      <br />
                      <span className="small">
                        {record.experiment.model.identified
                          ? "元記録ではモデル識別済み"
                          : "モデル識別情報は未取得"}
                      </span>
                    </td>
                    <td>
                      {display(record.experiment.task.id)}
                      <br />
                      <span className="small">課題版: {display(record.experiment.task.setVersion)}</span>
                      <br />
                      <span className="small">
                        {display(record.experiment.evaluation.protocolId)} / {display(record.experiment.evaluation.protocolVersion)}
                      </span>
                    </td>
                    <td>
                      {executionLabel(record.experiment)}
                      <br />
                      <span className="small">{record.experiment.execution.scoringStatus}</span>
                    </td>
                    <td>{record.experiment.contamination.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="comparison-title">
        <h2 id="comparison-title">条件付き比較</h2>
        {selectedRecords.length < 2 ? (
          <p className="muted">一覧から2件以上選択してください。</p>
        ) : (
          <>
            <h3>{comparison.label}</h3>
            <p>
              `conditions.id`の一致は要求せず、モデル識別子を含むfingerprint同士も比較しません。
              公開済みの課題・規約・採点項目・実行設定・環境を個別に確認します。
            </p>
            <IssueList title="既知の条件差" items={comparison.differences} />
            <IssueList title="未観測・非公開で一致を確認できない項目" items={comparison.unknowns} />
            <IssueList title="解釈上の注意" items={comparison.cautions} />
            <MetricCharts records={selectedRecords} />
            <ComparisonTable records={selectedRecords} />
          </>
        )}
      </section>

      <section className="panel" aria-labelledby="records-title">
        <h2 id="records-title">実験記録の詳細</h2>
        {visibleRecords.map((record) => (
          <RecordDetails key={record.key} record={record} />
        ))}
      </section>
      <footer className="small muted">
        このサイトは静的閲覧用です。データ登録・公開は手動でレビューした変更に限り、
        自動デプロイはこの段階では有効化しません。
      </footer>
    </main>
  );
}

function Filter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <input value={value} onChange={(event) => onChange(event.currentTarget.value)} />
    </label>
  );
}

function IssueList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4>{title}</h4>
      {items.length ? (
        <ul className="plainList">{items.map((item) => <li key={item}>{item}</li>)}</ul>
      ) : (
        <p className="muted">該当なし。</p>
      )}
    </div>
  );
}

function MetricCharts({ records }: { records: BenchmarkSource[] }) {
  const durations = records
    .map((record) => ({
      record,
      value: observed(record.experiment.execution.durationMs),
    }))
    .filter(
      (item): item is { record: BenchmarkSource; value: number } =>
        item.value !== null,
    );
  const maxDuration = Math.max(1, ...durations.map((item) => item.value));
  const maxScore = Math.max(
    1,
    ...records.flatMap((record) =>
      record.experiment.evaluation.criteria
        .map((criterion) =>
          typeof criterion.score === "number" ? criterion.score : null,
        )
        .filter((score): score is number => score !== null),
    ),
  );
  return (
    <>
      <h3>実行時間</h3>
      <p className="small muted">実測ミリ秒を同一の線形スケールで表示。未観測・非該当値は棒にせず、0として扱いません。</p>
      {durations.length ? (
        <div className="chart" aria-label="選択した実験の実測実行時間比較">
          {durations.map(({ record, value }) => (
            <div className="chartRow" key={record.key}>
              <span>{record.experiment.id}</span>
              <div className="barTrack" aria-hidden="true">
                <div className="bar" style={{ width: `${(value / maxDuration) * 100}%` }} />
              </div>
              <strong>{value.toLocaleString()} ms</strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">比較対象に実測実行時間はありません。</p>
      )}
      <h3>評価項目別得点</h3>
      <p className="small muted">
        得点の数値をそのまま共通ポイント軸に表示します。最大点が異なる場合は各値に併記し、未観測・非該当を棒で示しません。
      </p>
      <div className="scoreRows">
        {records.flatMap((record) =>
          record.experiment.evaluation.criteria.map((criterion) => {
            const score = criterion.score;
            const numericScore = typeof score === "number" ? score : null;
            return (
              <div className="scoreGroup" key={`${record.key}:${criterion.id}`}>
                <strong>{criterion.label} ({criterion.id})</strong>
                <div className="chartRow">
                  <span>{record.experiment.id}</span>
                  {numericScore !== null ? (
                    <div className="barTrack" aria-hidden="true">
                      <div className="bar" style={{ width: `${(numericScore / maxScore) * 100}%` }} />
                    </div>
                  ) : (
                    <span>{criterion.score === "not_applicable" ? "非該当" : "未観測"}</span>
                  )}
                  <strong>{numericScore !== null ? `${numericScore} / ${criterion.maxScore}点` : score}</strong>
                </div>
              </div>
            );
          }),
        )}
      </div>
    </>
  );
}

function ComparisonTable({ records }: { records: BenchmarkSource[] }) {
  return (
    <div className="tableWrap">
      <table>
        <caption>選択された実験の公開値。異なる課題・規約を合算した順位付けは行いません。</caption>
        <thead>
          <tr>
            <th scope="col">測定項目</th>
            {records.map((record) => <th scope="col" key={record.key}>{record.experiment.id}</th>)}
          </tr>
        </thead>
        <tbody>
          {[
            ["モデル", (experiment: PublicBenchmarkExperiment) => display(experiment.model.name)],
            ["モデル提供者", (experiment: PublicBenchmarkExperiment) => display(experiment.model.provider)],
            ["エージェント / interface", (experiment: PublicBenchmarkExperiment) => `${experiment.agent.name} / ${experiment.agent.interface}`],
            ["課題達成", (experiment: PublicBenchmarkExperiment) => experiment.execution.taskOutcome],
            ["実行状態", (experiment: PublicBenchmarkExperiment) => experiment.execution.status],
            ["採点状態", (experiment: PublicBenchmarkExperiment) => experiment.execution.scoringStatus],
            ["実行時間", (experiment: PublicBenchmarkExperiment) => observationText(experiment.execution.durationMs, (value) => `${value} ms`)],
            ["入力トークン数", (experiment: PublicBenchmarkExperiment) => observationText(experiment.execution.inputTokens)],
            ["出力トークン数", (experiment: PublicBenchmarkExperiment) => observationText(experiment.execution.outputTokens)],
            ["生成速度", (experiment: PublicBenchmarkExperiment) => observationText(experiment.execution.generationTokensPerSecond, (value) => `${value} tokens/s`)],
            ["情報汚染", (experiment: PublicBenchmarkExperiment) => `${experiment.contamination.status}${experiment.contamination.limitations.length ? ` — ${experiment.contamination.limitations.join(" / ")}` : ""}`],
            ["conditions.id", (experiment: PublicBenchmarkExperiment) => experiment.conditions.id],
          ].map(([label, render]) => (
            <tr key={String(label)}>
              <th scope="row">{String(label)}</th>
              {records.map((record) => (
                <td key={record.key}>{(render as (item: PublicBenchmarkExperiment) => string)(record.experiment)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecordDetails({ record }: { record: BenchmarkSource }) {
  const experiment = record.experiment;
  const references = [
    ...experiment.publicReferences,
    ...experiment.evaluation.criteria.flatMap((criterion) => criterion.evidenceReferences),
  ];
  return (
    <details className="recordCard" id={encodeURIComponent(experiment.id)}>
      <summary>{experiment.id} — {dataKindLabel(record.dataKind)}</summary>
      <div className="recordGrid">
        <dl>
          <dt>形式 / manifest</dt><dd>検証済み（SHA-256）</dd>
          <dt>登録</dt><dd>{record.registration === "catalog" ? "レビュー済みカタログ" : "ブラウザ内一時データ"}</dd>
          <dt>開始日時</dt><dd>{display(experiment.time.startedAt)}</dd>
          <dt>完了日時</dt><dd>{display(experiment.time.completedAt)}</dd>
          <dt>モデル</dt><dd>{display(experiment.model.name)} / {display(experiment.model.id)}</dd>
          <dt>モデル提供者</dt><dd>{display(experiment.model.provider)}</dd>
          <dt>モデル識別状態</dt><dd>{experiment.model.identified ? "元記録で識別済み" : "未識別"}</dd>
          <dt>エージェント</dt><dd>{experiment.agent.name} / {display(experiment.agent.version)} / {experiment.agent.interface}</dd>
          <dt>課題</dt><dd>{display(experiment.task.id)} / {display(experiment.task.setVersion)} / {display(experiment.task.title)}</dd>
          <dt>評価規約</dt><dd>{display(experiment.evaluation.protocolId)} / {display(experiment.evaluation.protocolVersion)}</dd>
          <dt>情報汚染</dt><dd>{experiment.contamination.status}{experiment.contamination.limitations.length ? `: ${experiment.contamination.limitations.join(" / ")}` : ""}</dd>
          <dt>内容スキャン警告</dt><dd>{record.warnings.join(" / ") || "検出された警告なし（安全性を保証しません）"}</dd>
        </dl>
        <dl>
          <dt>環境</dt>
          <dd>
            OS: {display(experiment.environment.os)}<br />
            CPU: {display(experiment.environment.cpu)}<br />
            GPU: {display(experiment.environment.gpu)}<br />
            Memory: {display(experiment.environment.memory)}<br />
            Mode: {experiment.environment.executionMode}
          </dd>
          <dt>実行条件</dt>
          <dd>
            <code>{JSON.stringify(experiment.conditions.settings)}</code>
            <p className="small muted">conditions.idはモデル識別情報を含むfingerprintです。同一条件の証明やモデル間の一致判定には使いません。</p>
          </dd>
          <dt>未観測環境</dt><dd>{experiment.environment.unavailable.join(" / ") || "なしと記録"}</dd>
          <dt>未評価理由</dt><dd>{experiment.execution.evaluationUnavailable.join(" / ") || "なしと記録"}</dd>
          <dt>再現性の制約</dt><dd>{experiment.contamination.limitations.join(" / ") || "追加の制約記録なし"}</dd>
        </dl>
      </div>
      <h4>評価項目</h4>
      {experiment.evaluation.criteria.length ? (
        <div className="tableWrap">
          <table>
            <thead><tr><th scope="col">項目</th><th scope="col">点数</th><th scope="col">採点</th><th scope="col">未観測</th><th scope="col">証拠・判断</th></tr></thead>
            <tbody>
              {experiment.evaluation.criteria.map((criterion) => (
                <tr key={criterion.id}>
                  <th scope="row">{criterion.label} ({criterion.id})<br />{display(criterion.description)}</th>
                  <td>{typeof criterion.score === "number" ? `${criterion.score} / ${criterion.maxScore}` : criterion.score}</td>
                  <td>{criterion.scoringMethod}</td>
                  <td>{criterion.unobserved.join(" / ") || "なしと記録"}</td>
                  <td>{criterion.evidence.join(" / ")}<br />{display(criterion.assessorJudgment)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p>評価項目の記録はありません。</p>}
      <h4>テスト結果</h4>
      {experiment.execution.tests.length ? (
        <ul className="testList">
          {experiment.execution.tests.map((test, index) => (
            <li key={`${index}:${test.name}`}>
              {test.name}: {test.status}; command {display(test.command)}; evidence {display(test.evidence)}
            </li>
          ))}
        </ul>
      ) : <p>テスト結果は未記録です。</p>}
      {references.length ? (
        <>
          <h4>公開参照</h4>
          <ul className="plainList">
            {references.map((reference, index) => {
              const href = safeExternalHref(reference);
              return (
                <li key={`${index}:${reference}`}>
                  {href ? <a href={href} target="_blank" rel="noopener noreferrer">{reference}</a> : reference}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      {experiment.execution.response.status === "observed" ? (
        <details>
          <summary>公開回答を確認</summary>
          <pre>{experiment.execution.response.value}</pre>
        </details>
      ) : null}
    </details>
  );
}
