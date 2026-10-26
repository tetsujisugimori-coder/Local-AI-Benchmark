import {
  inspectPublicContent,
  safePublicReference,
  validatePublicBenchmarkDocument,
  verifyIntegrityManifest,
} from "../../../src/lib/public-benchmark.ts";
import type {
  Observation,
  PublicBenchmarkDocument,
  PublicBenchmarkExperiment,
  PublicIntegrityManifest,
} from "../../../src/types/public-benchmark.ts";

export const MAX_BENCHMARK_BYTES = 2 * 1024 * 1024;
export const MAX_MANIFEST_BYTES = 32 * 1024;

export type CatalogEntry = {
  id: string;
  dataFile: string;
  manifestFile: string;
  dataKind: PublicBenchmarkDocument["dataKind"];
  reviewedAt: string;
  reviewedBy: string;
  reviewNote: string;
};

export type BenchmarkSource = {
  key: string;
  label: string;
  dataKind: PublicBenchmarkDocument["dataKind"];
  experiment: PublicBenchmarkExperiment;
  integrity: "verified";
  registration: "catalog" | "temporary";
  warnings: string[];
};

export type MetricGroup = {
  dataKind: PublicBenchmarkDocument["dataKind"];
  label: string;
  points: Array<{
    record: BenchmarkSource;
    durationMs: number | null;
    criteria: Array<{
      id: string;
      label: string;
      score: number | null;
      scoreStatus: "observed" | "not_observed" | "not_applicable";
      maxScore: number;
    }>;
  }>;
};

export type VerifiedPair = {
  document: PublicBenchmarkDocument;
  manifest: PublicIntegrityManifest;
  warnings: string[];
};

export function validateCatalog(value: unknown): asserts value is {
  catalogVersion: 1;
  entries: CatalogEntry[];
} {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("catalogVersion" in value) ||
    value.catalogVersion !== 1 ||
    !("entries" in value) ||
    !Array.isArray(value.entries) ||
    value.entries.length > 500
  ) {
    throw new Error("公開カタログの形式またはバージョンが不正です。");
  }
  const ids = new Set<string>();
  for (const entry of value.entries) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      Array.isArray(entry) ||
      !("id" in entry) ||
      typeof entry.id !== "string" ||
      !/^[a-z0-9][a-z0-9-]{2,63}$/.test(entry.id) ||
      ids.has(entry.id) ||
      !("dataFile" in entry) ||
      entry.dataFile !== `data/${entry.id}.json` ||
      !("manifestFile" in entry) ||
      entry.manifestFile !== `data/${entry.id}.manifest.json` ||
      !("dataKind" in entry) ||
      !["user_recorded", "synthetic_sample"].includes(String(entry.dataKind)) ||
      !("reviewedAt" in entry) ||
      typeof entry.reviewedAt !== "string" ||
      !Number.isFinite(Date.parse(entry.reviewedAt)) ||
      !("reviewedBy" in entry) ||
      typeof entry.reviewedBy !== "string" ||
      !entry.reviewedBy.trim() ||
      !("reviewNote" in entry) ||
      typeof entry.reviewNote !== "string" ||
      !entry.reviewNote.trim()
    ) {
      throw new Error("公開カタログに不正または重複したエントリがあります。");
    }
    ids.add(entry.id);
  }
}

function decodeExactUtf8(bytes: Uint8Array, maxBytes: number, label: string): string {
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) {
    throw new Error(`${label}のサイズが許容範囲外です。`);
  }
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label}が正しいUTF-8ではありません。`);
  }
  const encoded = new TextEncoder().encode(decoded);
  if (
    encoded.byteLength !== bytes.byteLength ||
    encoded.some((byte, index) => byte !== bytes[index])
  ) {
    throw new Error(`${label}のUTF-8バイト表現が正規化できません。`);
  }
  return decoded;
}

export async function verifyBenchmarkPair({
  jsonBytes,
  manifestBytes,
  expectedDataKind,
}: {
  jsonBytes: Uint8Array;
  manifestBytes: Uint8Array;
  expectedDataKind?: PublicBenchmarkDocument["dataKind"];
}): Promise<VerifiedPair> {
  const serializedDocument = decodeExactUtf8(
    jsonBytes,
    MAX_BENCHMARK_BYTES,
    "公開JSON",
  );
  const serializedManifest = decodeExactUtf8(
    manifestBytes,
    MAX_MANIFEST_BYTES,
    "manifest",
  );
  let document: unknown;
  let manifest: unknown;
  try {
    document = JSON.parse(serializedDocument);
    manifest = JSON.parse(serializedManifest);
  } catch {
    throw new Error("公開JSONまたはmanifestのJSON構文が不正です。");
  }
  validatePublicBenchmarkDocument(document);
  if (expectedDataKind && document.dataKind !== expectedDataKind) {
    throw new Error("カタログと公開JSONのデータ種別が一致しません。");
  }
  const inspection = inspectPublicContent(document);
  if (inspection.blocked.length > 0) {
    throw new Error(
      `公開JSONに表示を停止する内容があります: ${inspection.blocked.join("; ")}`,
    );
  }
  if (
    !(await verifyIntegrityManifest({
      manifest,
      serializedDocument,
    }))
  ) {
    throw new Error("manifestと公開JSONのSHA-256が一致しません。");
  }
  return {
    document,
    manifest: manifest as PublicIntegrityManifest,
    warnings: inspection.warnings,
  };
}

export function observationText<T>(
  observation: Observation<T>,
  render: (value: T) => string = (value) => String(value),
): string {
  switch (observation.status) {
    case "observed":
      return render(observation.value);
    case "not_observed":
      return `未観測: ${observation.reason}`;
    case "not_applicable":
      return `非該当: ${observation.reason}`;
  }
}

export function buildMetricGroups(records: BenchmarkSource[]): MetricGroup[] {
  const groups = new Map<PublicBenchmarkDocument["dataKind"], BenchmarkSource[]>();
  for (const record of records) {
    const group = groups.get(record.dataKind) ?? [];
    group.push(record);
    groups.set(record.dataKind, group);
  }
  const labels: Record<PublicBenchmarkDocument["dataKind"], string> = {
    user_recorded: "利用者記録（独立した実測検証なし）",
    synthetic_sample: "合成例示（実験・実測ではありません）",
  };
  return (["user_recorded", "synthetic_sample"] as const).flatMap((dataKind) => {
    const group = groups.get(dataKind);
    if (!group) return [];
    return [
      {
        dataKind,
        label: labels[dataKind],
        points: group.map((record) => ({
          record,
          durationMs:
            record.experiment.execution.durationMs.status === "observed"
              ? record.experiment.execution.durationMs.value
              : null,
          criteria: record.experiment.evaluation.criteria.map((criterion) => ({
            id: criterion.id,
            label: criterion.label,
            score:
              typeof criterion.score === "number" ? criterion.score : null,
            scoreStatus:
              typeof criterion.score === "number"
                ? "observed"
                : criterion.score,
            maxScore: criterion.maxScore,
          })),
        })),
      },
    ];
  });
}

function knownObservation<T>(observation: Observation<T>): T | null {
  return observation.status === "observed" ? observation.value : null;
}

function compareUnorderedStrings(
  observation: Observation<string[]>,
): string[] | null {
  const values = knownObservation(observation);
  return values === null ? null : [...values].sort(compareCodeUnits);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export type Comparability = {
  label: "直接比較可能" | "条件差があるため参考比較" | "直接比較不可";
  differences: string[];
  unknowns: string[];
  cautions: string[];
};

export type ComparabilityRecord = {
  experiment: PublicBenchmarkExperiment;
  dataKind: PublicBenchmarkDocument["dataKind"];
};

export function assessComparability(
  records: Array<PublicBenchmarkExperiment | ComparabilityRecord>,
): Comparability {
  const sources = records.map((record) =>
    "experiment" in record
      ? record
      : { experiment: record, dataKind: "user_recorded" as const },
  );
  const experiments = sources.map((source) => source.experiment);
  if (experiments.length < 2) {
    return {
      label: "直接比較不可",
      differences: ["比較には2件以上の実験が必要です。"],
      unknowns: [],
      cautions: [],
    };
  }
  const differences = new Set<string>();
  const unknowns = new Set<string>();
  const cautions = new Set<string>();
  const compareObserved = <T>(
    label: string,
    values: Array<T | null>,
  ) => {
    if (values.some((value) => value === null)) {
      unknowns.add(`${label}が未観測または非公開です。`);
    }
    const knownValues = values.filter(
      (value): value is T => value !== null,
    );
    if (knownValues.some((value) => !compareJson(value, knownValues[0]))) {
      differences.add(`${label}が異なります。`);
    }
  };
  const dataKinds = new Set(sources.map((source) => source.dataKind));
  if (dataKinds.has("synthetic_sample") && dataKinds.has("user_recorded")) {
    differences.add(
      "合成例示と利用者記録は異なるデータ種別のため、性能値を直接比較できません。",
    );
  } else if (dataKinds.has("synthetic_sample")) {
    cautions.add("合成例示は性能測定ではなく、参考比較に限定されます。");
  }
  compareObserved(
    "課題ID",
    experiments.map((experiment) => knownObservation(experiment.task.id)),
  );
  compareObserved(
    "課題セットID",
    experiments.map((experiment) => knownObservation(experiment.task.setId)),
  );
  compareObserved(
    "課題バージョン",
    experiments.map((experiment) =>
      knownObservation(experiment.task.setVersion),
    ),
  );
  compareObserved(
    "課題本文",
    experiments.map((experiment) =>
      knownObservation(experiment.task.prompt),
    ),
  );
  compareObserved(
    "実行インターフェース",
    experiments.map((experiment) => experiment.agent.interface),
  );
  compareObserved(
    "利用可能ツール",
    experiments.map((experiment) =>
      compareUnorderedStrings(experiment.agent.tools),
    ),
  );
  compareObserved(
    "エージェント権限",
    experiments.map((experiment) =>
      knownObservation(experiment.agent.permissions),
    ),
  );
  compareObserved(
    "人間の介入条件",
    experiments.map((experiment) =>
      knownObservation(experiment.agent.humanIntervention),
    ),
  );
  compareObserved(
    "評価規約ID",
    experiments.map((experiment) =>
      knownObservation(experiment.evaluation.protocolId),
    ),
  );
  compareObserved(
    "評価規約バージョン",
    experiments.map((experiment) =>
      knownObservation(experiment.evaluation.protocolVersion),
    ),
  );
  const criterionShape = (experiment: PublicBenchmarkExperiment) =>
    experiment.evaluation.criteria.map((criterion) => ({
      id: criterion.id,
      label: criterion.label,
      scoringMethod: criterion.scoringMethod,
      maxScore: criterion.maxScore,
    }));
  compareObserved(
    "評価項目・配点・採点方法",
    experiments.map(criterionShape),
  );
  for (const { id } of experiments[0].evaluation.criteria) {
    compareObserved(
      `評価項目「${id}」の説明`,
      experiments.map((experiment) => {
        const criterion = experiment.evaluation.criteria.find(
          (item) => item.id === id,
        );
        return criterion?.description.status === "observed"
          ? criterion.description.value
          : null;
      }),
    );
  }
  const settingsByExperiment = experiments.map(
    (experiment) => experiment.conditions.settings,
  );
  const settingKeys = new Set(settingsByExperiment.flatMap(Object.keys));
  if (settingKeys.size === 0) {
    unknowns.add("実行設定は公開されていません。");
  }
  for (const key of settingKeys) {
    const values = settingsByExperiment.map((settings) => settings[key]);
    if (values.some((value) => value === undefined || value === null)) {
      unknowns.add(`実行設定「${key}」が一部で未記録または非公開です。`);
    }
    const knownValues = values.filter(
      (value): value is NonNullable<typeof value> =>
        value !== undefined && value !== null,
    );
    if (knownValues.some((value) => !compareJson(value, knownValues[0]))) {
      differences.add(`実行設定「${key}」が異なります。`);
    }
  }
  if (
    new Set(experiments.map((experiment) => experiment.execution.scoringStatus))
      .size > 1
  ) {
    cautions.add("採点状態が実験間で異なります。");
  }
  const hardware = (experiment: PublicBenchmarkExperiment) => ({
    os: experiment.environment.os,
    cpu: experiment.environment.cpu,
    gpu: experiment.environment.gpu,
    memory: experiment.environment.memory,
    executionMode: experiment.environment.executionMode,
  });
  const hardwareValues = experiments.map(hardware);
  for (const key of ["os", "cpu", "gpu", "memory"] as const) {
    const values = hardwareValues.map((value) =>
      value[key].status === "observed" ? value[key].value : null,
    );
    if (values.some((value) => value === null)) {
      unknowns.add(`${key.toUpperCase()}が一部で未観測または非公開です。`);
    }
    const knownValues = values.filter((value): value is string => value !== null);
    if (knownValues.some((value) => !compareJson(value, knownValues[0]))) {
      differences.add(`${key.toUpperCase()}が異なります。`);
    }
  }
  const executionModes = hardwareValues.map((value) => value.executionMode);
  if (executionModes.some((mode) => !mode || mode === "not disclosed")) {
    unknowns.add("実行方式が一部で未観測または非公開です。");
  }
  const knownExecutionModes = executionModes.filter(
    (mode): mode is string => Boolean(mode) && mode !== "not disclosed",
  );
  if (
    knownExecutionModes.some(
      (mode) => !compareJson(mode, knownExecutionModes[0]),
    )
  ) {
    differences.add("実行方式が異なります。");
  }
  if (
    experiments.some(
      (experiment) => experiment.execution.scoringStatus === "unscored",
    )
  ) {
    cautions.add("採点未実施の実験が含まれています。");
  }
  if (experiments.some((experiment) => experiment.contamination.status === "present")) {
    cautions.add("情報汚染ありの実験が含まれています。");
  }
  if (experiments.some((experiment) => experiment.contamination.status === "unknown")) {
    cautions.add("情報汚染状態が不明の実験が含まれています。");
  }
  if (
    experiments.some(
      (experiment) =>
        experiment.execution.status !== "completed" ||
        experiment.execution.taskOutcome !== "success",
    )
  ) {
    cautions.add("成功以外の実行状態または課題達成状態を含みます。");
  }
  if (differences.size > 0) {
    return {
      label: "直接比較不可",
      differences: [...differences],
      unknowns: [...unknowns],
      cautions: [...cautions],
    };
  }
  if (unknowns.size > 0 || cautions.size > 0) {
    return {
      label: "条件差があるため参考比較",
      differences: [],
      unknowns: [...unknowns],
      cautions: [...cautions],
    };
  }
  return {
    label: "直接比較可能",
    differences: [],
    unknowns: [],
    cautions: [],
  };
}

export function safeExternalHref(value: string): string | null {
  return safePublicReference(value);
}
