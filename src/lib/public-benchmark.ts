import { parseBenchmarkDocument } from "./benchmark-document.ts";
import type {
  BenchmarkDocument,
  BenchmarkResult,
  CriterionScore,
  ExecutionStatus,
  ScoringStatus,
} from "../types/benchmark";
import {
  CLI_RECORD_FORMAT,
  PUBLIC_BENCHMARK_FORMAT,
  type CliManualRecord,
  type Observation,
  type PublicBenchmarkDocument,
  type PublicBenchmarkExperiment,
  type PublicDisclosureOptions,
  type PublicEvaluationCriterion,
  type PublicIntegrityManifest,
  type PublicScore,
} from "../types/public-benchmark.ts";

const EXECUTION_STATUSES = new Set<ExecutionStatus>([
  "completed",
  "failed",
  "aborted",
  "not_run",
]);
const SCORING_STATUSES = new Set<ScoringStatus>([
  "unscored",
  "automatic",
  "manual_required",
  "partial",
  "manual_complete",
]);
const ERROR_CODES = new Set([
  "OLLAMA_NOT_RUNNING",
  "CONNECTION_FAILED",
  "MODEL_NOT_INSTALLED",
  "MODEL_LOAD_FAILED",
  "TIMEOUT",
  "INVALID_RESPONSE",
  "ABORTED",
  "OLLAMA_ERROR",
  "INVALID_REQUEST",
]);
const PUBLIC_INTERFACE_TYPES = new Set(["api", "cli", "ide", "cloud", "other"]);
const TASK_OUTCOMES = new Set([
  "success",
  "failure",
  "indeterminate",
  "not_applicable",
]);
const CONTAMINATION_STATUSES = new Set(["none_detected", "present", "unknown"]);
const PUBLIC_CONDITION_SETTING_KEYS = new Set([
  "repositoryId",
  "baseSha",
  "timeLimitMinutes",
  "temperature",
  "seed",
  "maxTokens",
  "contextLength",
  "executionCount",
  "runMode",
  "stream",
  "think",
  "ollamaVersion",
]);
const TEST_STATUSES = new Set([
  "passed",
  "failed",
  "not_run",
  "not_applicable",
]);

export const DEFAULT_PUBLIC_DISCLOSURE: PublicDisclosureOptions = {
  includeTaskPrompt: false,
  includeResponses: false,
  includeEvidence: false,
  includeJudgments: false,
  includeTestCommands: false,
};

export type PublicContentInspection = {
  blocked: string[];
  warnings: string[];
};

export class PublicBenchmarkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicBenchmarkError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNonNegative(value) && Number.isInteger(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isFiniteNonNegative(value);
}

function isIsoDateTime(value: unknown): value is string {
  return (
    isString(value) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) &&
    Number.isFinite(Date.parse(value))
  );
}

function observed<T>(value: T | null | undefined, reason: string): Observation<T> {
  return value === null || value === undefined || value === ""
    ? { status: "not_observed", reason }
    : { status: "observed", value };
}

function observationForText(
  value: string | null,
  included: boolean,
  notIncludedReason: string,
  missingReason: string,
): Observation<string> {
  if (!value) {
    return { status: "not_observed", reason: missingReason };
  }
  return included
    ? { status: "observed", value }
    : { status: "not_observed", reason: notIncludedReason };
}

function validateResult(value: unknown, index: number): asserts value is BenchmarkResult {
  if (!isRecord(value)) {
    throw new PublicBenchmarkError(`results[${index}]がオブジェクトではありません。`);
  }
  const settings = value.settings;
  if (
    !isString(value.modelId) ||
    !isString(value.displayName) ||
    typeof value.runNumber !== "number" ||
    !Number.isInteger(value.runNumber) ||
    value.runNumber < 1 ||
    !isString(value.response) ||
    !isString(value.thinking ?? "") ||
    !isIsoDateTime(value.startedAt) ||
    !isIsoDateTime(value.finishedAt) ||
    !isFiniteNonNegative(value.elapsedMs) ||
    !isNullableNumber(value.totalDurationNs) ||
    !isNullableNumber(value.loadDurationNs) ||
    !(value.promptEvalCount === null ||
      isNonNegativeInteger(value.promptEvalCount)) ||
    !isNullableNumber(value.promptEvalDurationNs) ||
    !(value.evalCount === null || isNonNegativeInteger(value.evalCount)) ||
    !isNullableNumber(value.evalDurationNs) ||
    !isNullableNumber(value.promptTokensPerSecond) ||
    !isNullableNumber(value.outputTokensPerSecond) ||
    !isNullableString(value.doneReason) ||
    !isRecord(settings) ||
    (value.executionStatus !== undefined &&
      !EXECUTION_STATUSES.has(value.executionStatus as ExecutionStatus)) ||
    (value.scoringStatus !== undefined &&
      !SCORING_STATUSES.has(value.scoringStatus as ScoringStatus)) ||
    (value.error !== null && value.error !== undefined && !isRecord(value.error))
  ) {
    throw new PublicBenchmarkError(`results[${index}]の値または状態が不正です。`);
  }
  for (const key of [
    "systemPrompt",
    "temperature",
    "seed",
    "maxTokens",
    "contextLength",
    "executionCount",
    "runMode",
    "stream",
  ]) {
    if (!(key in settings)) {
      throw new PublicBenchmarkError(
        `results[${index}].settings.${key}が不足しています。`,
      );
    }
  }
  if (
    !isString(settings.systemPrompt) ||
    !isFiniteNonNegative(settings.temperature) ||
    typeof settings.seed !== "number" ||
    !Number.isFinite(settings.seed) ||
    !isNonNegativeInteger(settings.maxTokens) ||
    !isNonNegativeInteger(settings.contextLength) ||
    !isNonNegativeInteger(settings.executionCount) ||
    (settings.runMode !== "cold" && settings.runMode !== "warm") ||
    typeof settings.stream !== "boolean" ||
    (settings.think !== undefined && typeof settings.think !== "boolean")
  ) {
    throw new PublicBenchmarkError(`results[${index}].settingsが不正です。`);
  }
  if (
    value.error &&
    (!isString(value.error.code) ||
      !ERROR_CODES.has(value.error.code) ||
      !isString(value.error.message))
  ) {
    throw new PublicBenchmarkError(`results[${index}].errorが不正です。`);
  }
  if (
    value.error &&
    value.executionStatus !== undefined &&
    value.executionStatus !==
      (value.error.code === "ABORTED" ? "aborted" : "failed")
  ) {
    throw new PublicBenchmarkError(
      `results[${index}]のexecutionStatusとerrorが一致しません。`,
    );
  }
  if (value.criterionScores !== undefined && !Array.isArray(value.criterionScores)) {
    throw new PublicBenchmarkError(`results[${index}].criterionScoresが不正です。`);
  }
  for (const [scoreIndex, score] of (
    (value.criterionScores as unknown[] | undefined) ?? []
  ).entries()) {
    if (
      !isRecord(score) ||
      !isString(score.criterionId) ||
      !isString(score.label) ||
      !["passed", "failed", "manual_required", "not_scored"].includes(
        String(score.status),
      ) ||
      !isNullableNumber(score.score) ||
      !isFiniteNonNegative(score.maxScore) ||
      !Number.isInteger(score.maxScore) ||
      !isString(score.note) ||
      (score.score !== null && score.score > score.maxScore) ||
      ((score.status === "manual_required" || score.status === "not_scored") !==
        (score.score === null))
    ) {
      throw new PublicBenchmarkError(
        `results[${index}].criterionScores[${scoreIndex}]が不正です。`,
      );
    }
  }
}

function validateOllamaInput(value: unknown): BenchmarkDocument {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isString(value.benchmarkId) ||
    !isIsoDateTime(value.createdAt) ||
    (value.completedAt !== undefined && !isIsoDateTime(value.completedAt)) ||
    !isRecord(value.environment) ||
    !isRecord(value.request) ||
    !Array.isArray(value.results)
  ) {
    throw new PublicBenchmarkError(
      "対応するschemaVersion 1のOllama結果JSONではありません。",
    );
  }
  if (
    value.benchmarkMode !== undefined &&
    value.benchmarkMode !== "freeform" &&
    value.benchmarkMode !== "phase2"
  ) {
    throw new PublicBenchmarkError("benchmarkModeが不正です。");
  }
  const request = value.request;
  const environment = value.environment;
  if (
    !isString(environment.ollamaBaseUrl) ||
    !isString(environment.appVersion) ||
    !isString(environment.platform) ||
    !isString(environment.cpu) ||
    !isString(environment.memory) ||
    !isString(request.prompt) ||
    !isString(request.systemPrompt) ||
    !isFiniteNonNegative(request.temperature) ||
    typeof request.seed !== "number" ||
    !Number.isFinite(request.seed) ||
    !isNonNegativeInteger(request.maxTokens) ||
    !isNonNegativeInteger(request.contextLength) ||
    !isNonNegativeInteger(request.executionCount) ||
    (request.runMode !== "cold" && request.runMode !== "warm") ||
    typeof request.stream !== "boolean" ||
    (request.think !== undefined && typeof request.think !== "boolean")
  ) {
    throw new PublicBenchmarkError("Ollama結果のrequestが不正です。");
  }
  for (const [index, result] of value.results.entries()) {
    validateResult(result, index);
  }
  if (
    value.benchmarkMode === "phase2" &&
    (!isString(value.problemId) ||
      !isString(value.problemTitle) ||
      !isString(value.problemSetVersion))
  ) {
    throw new PublicBenchmarkError("Phase 2問題情報が不足しています。");
  }
  if (
    (value.evaluationCriteria !== undefined &&
      (!Array.isArray(value.evaluationCriteria) ||
        !value.evaluationCriteria.every(
          (criterion) =>
            isRecord(criterion) &&
            isString(criterion.id) &&
            isString(criterion.label) &&
            isString(criterion.description) &&
            Number.isInteger(criterion.maxScore) &&
            isFiniteNonNegative(criterion.maxScore) &&
            criterion.maxScore > 0 &&
            ["automatic", "manual"].includes(
              String(criterion.scoringMethod),
            ),
        ))) ||
    (value.expectedAnswerConditions !== undefined &&
      !isStringArray(value.expectedAnswerConditions))
  ) {
    throw new PublicBenchmarkError("評価基準または期待条件が不正です。");
  }

  try {
    return parseBenchmarkDocument(value);
  } catch (error) {
    throw new PublicBenchmarkError(
      error instanceof Error
        ? error.message
        : "Ollama結果JSONを読み込めません。",
    );
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isPublicScore(value: unknown, maxScore: number): value is PublicScore {
  return (
    value === "not_observed" ||
    value === "not_applicable" ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= maxScore)
  );
}

function isPrimitiveRecord(
  value: unknown,
): value is Record<string, string | number | boolean | null> {
  return (
    isRecord(value) &&
    Object.entries(value).every(
      ([key, entry]) =>
        /^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/.test(key) &&
        (entry === null ||
          isString(entry) ||
          typeof entry === "boolean" ||
          (typeof entry === "number" && Number.isFinite(entry))),
    )
  );
}

function isPublicConditionSettings(
  value: unknown,
): value is Record<string, string | number | boolean | null> {
  const stringKeys = new Set([
    "repositoryId",
    "baseSha",
    "runMode",
    "ollamaVersion",
  ]);
  const numberKeys = new Set([
    "timeLimitMinutes",
    "temperature",
    "seed",
    "maxTokens",
    "contextLength",
    "executionCount",
  ]);
  const booleanKeys = new Set(["stream", "think"]);
  return (
    isPrimitiveRecord(value) &&
    Object.entries(value).every(([key, entry]) => {
      if (!PUBLIC_CONDITION_SETTING_KEYS.has(key)) {
        return false;
      }
      if (entry === null) {
        return true;
      }
      return (
        (stringKeys.has(key) && isString(entry)) ||
        (numberKeys.has(key) && isFiniteNonNegative(entry)) ||
        (booleanKeys.has(key) && typeof entry === "boolean")
      );
    })
  );
}

function validateCliRecord(
  value: unknown,
): asserts value is CliManualRecord {
  if (
    !isRecord(value) ||
    value.format !== CLI_RECORD_FORMAT ||
    !isRecord(value.experiment) ||
    !isRecord(value.model) ||
    !isRecord(value.agent) ||
    !isRecord(value.environment) ||
    !isPublicConditionSettings(value.conditions) ||
    !isRecord(value.execution) ||
    !isRecord(value.evaluation) ||
    !isRecord(value.contamination)
  ) {
    throw new PublicBenchmarkError(
      `CLI評価記録は${CLI_RECORD_FORMAT}形式である必要があります。`,
    );
  }
  const experiment = value.experiment;
  const model = value.model;
  const agent = value.agent;
  const environment = value.environment;
  const execution = value.execution;
  const evaluation = value.evaluation;
  const contamination = value.contamination;
  if (
    !isString(experiment.id) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(experiment.id) ||
    !isString(experiment.taskId) ||
    !isNullableString(experiment.taskSetId) ||
    !isNullableString(experiment.taskSetVersion) ||
    !isString(experiment.taskTitle) ||
    !isNullableString(experiment.taskPrompt) ||
    !isNullableString(experiment.startedAt) ||
    !isNullableString(experiment.completedAt) ||
    !isNullableString(experiment.timezone) ||
    !isNullableString(experiment.evaluationProtocolId) ||
    !isNullableString(experiment.evaluationProtocolVersion) ||
    !isNullableString(model.name) ||
    !isNullableString(model.id) ||
    !isNullableString(model.version) ||
    !isNullableString(model.provider) ||
    !["manual", "automatic", "unknown"].includes(
      String(model.selectionMethod),
    ) ||
    !isString(agent.name) ||
    !isNullableString(agent.version) ||
    !PUBLIC_INTERFACE_TYPES.has(String(agent.interface)) ||
    !(agent.tools === null || isStringArray(agent.tools)) ||
    !isNullableString(agent.permissions) ||
    !isNullableString(agent.humanIntervention) ||
    !isNullableString(environment.os) ||
    !isNullableString(environment.cpu) ||
    !isNullableString(environment.gpu) ||
    !isNullableString(environment.memory) ||
    !isString(environment.executionMode) ||
    !isStringArray(environment.unavailable) ||
    !EXECUTION_STATUSES.has(execution.status as ExecutionStatus) ||
    !TASK_OUTCOMES.has(String(execution.taskOutcome)) ||
    !SCORING_STATUSES.has(execution.scoringStatus as ScoringStatus) ||
    !isNullableNumber(execution.automaticScore) ||
    !isNullableNumber(execution.manualScore) ||
    !isNullableString(execution.response) ||
    !isNullableNumber(execution.durationMs) ||
    !isNullableNumber(execution.modelLoadDurationMs) ||
    !isNullableNumber(execution.promptEvaluationDurationMs) ||
    !(execution.inputTokens === null ||
      isNonNegativeInteger(execution.inputTokens)) ||
    !(execution.outputTokens === null ||
      isNonNegativeInteger(execution.outputTokens)) ||
    !isNullableNumber(execution.generationTokensPerSecond) ||
    !isNullableString(execution.completionReason) ||
    !isStringArray(execution.evaluationUnavailable) ||
    !isNullableString(execution.errorCode) ||
    !(execution.cost === null ||
      (isRecord(execution.cost) &&
        isFiniteNonNegative(execution.cost.amount) &&
        isString(execution.cost.currency) &&
        /^[A-Z]{3}$/.test(execution.cost.currency))) ||
    !Array.isArray(execution.tests) ||
    !Array.isArray(evaluation.criteria) ||
    !CONTAMINATION_STATUSES.has(String(contamination.status)) ||
    !isStringArray(contamination.limitations) ||
    !isStringArray(value.publicReferences)
  ) {
    throw new PublicBenchmarkError("CLI評価記録の必須項目または値が不正です。");
  }
  for (const [index, test] of execution.tests.entries()) {
    if (
      !isRecord(test) ||
      !isString(test.name) ||
      !TEST_STATUSES.has(String(test.status)) ||
      !isNullableString(test.command) ||
      !isNullableString(test.evidence)
    ) {
      throw new PublicBenchmarkError(
        `execution.tests[${index}]の値または状態が不正です。`,
      );
    }
  }
  for (const [index, criterion] of evaluation.criteria.entries()) {
    if (
      !isRecord(criterion) ||
      !isString(criterion.id) ||
      !isString(criterion.label) ||
      !isString(criterion.description) ||
      !["automatic", "manual"].includes(String(criterion.scoringMethod)) ||
      !isFiniteNonNegative(criterion.maxScore) ||
      !Number.isInteger(criterion.maxScore) ||
      criterion.maxScore === 0 ||
      criterion.maxScore > 4 ||
      !isPublicScore(criterion.score, criterion.maxScore) ||
      !isStringArray(criterion.evidence) ||
      !isStringArray(criterion.unobserved) ||
      !isNullableString(criterion.assessorJudgment) ||
      !isStringArray(criterion.evidenceReferences)
    ) {
      throw new PublicBenchmarkError(
        `evaluation.criteria[${index}]が不正です。CLI評価は0〜4点、未観測、該当なしで記録してください。`,
      );
    }
  }
  if (
    execution.status !== "completed" &&
    execution.taskOutcome === "success"
  ) {
    throw new PublicBenchmarkError(
      "未完了の実行を成功として記録できません。未観測またはindeterminateにしてください。",
    );
  }
  if (
    execution.status === "not_run" &&
    execution.taskOutcome === "failure"
  ) {
    throw new PublicBenchmarkError(
      "未実行の試行を失敗として記録できません。indeterminateまたはnot_applicableにしてください。",
    );
  }
  if (
    execution.status === "not_run" &&
    evaluation.criteria.some(
      (criterion) => typeof criterion.score === "number",
    )
  ) {
    throw new PublicBenchmarkError(
      "未実行の試行に評価点は記録できません。N/OまたはN/Aを使用してください。",
    );
  }
  if (
    execution.taskOutcome === "success" &&
    !evaluation.criteria.some(
      (criterion) => typeof criterion.score === "number" && criterion.score > 0,
    ) &&
    !execution.tests.some((test) => test.status === "passed")
  ) {
    throw new PublicBenchmarkError(
      "成功判定には、採点済みの評価項目または成功したテストの証拠が必要です。",
    );
  }
  if (
    !value.publicReferences.every((reference) => {
      try {
        const url = new URL(reference);
        return (
          (url.protocol === "https:" || url.protocol === "http:") &&
          !url.username &&
          !url.password
        );
      } catch {
        return false;
      }
    })
  ) {
    throw new PublicBenchmarkError(
      "公開参照には認証情報を含まないHTTP(S) URLだけを指定してください。",
    );
  }
  if (
    (experiment.startedAt !== null && !isIsoDateTime(experiment.startedAt)) ||
    (experiment.completedAt !== null &&
      !isIsoDateTime(experiment.completedAt))
  ) {
    throw new PublicBenchmarkError("CLI評価記録の日時が不正です。");
  }
  if (
    execution.status === "not_run" &&
    [
      execution.automaticScore,
      execution.manualScore,
      execution.response,
      execution.durationMs,
      execution.modelLoadDurationMs,
      execution.promptEvaluationDurationMs,
      execution.inputTokens,
      execution.outputTokens,
      execution.generationTokensPerSecond,
      execution.completionReason,
      execution.cost,
      execution.errorCode,
    ].some((entry) => entry !== null)
  ) {
    throw new PublicBenchmarkError(
      "not_runの記録に実測値や回答は設定できません。",
    );
  }
  if (
    execution.status === "not_run" &&
    execution.tests.some(
      (test) => test.status === "passed" || test.status === "failed",
    )
  ) {
    throw new PublicBenchmarkError(
      "not_runの記録に実行済みテスト結果は設定できません。",
    );
  }

  if (value.template === true) {
    throw new PublicBenchmarkError(
      "CLIテンプレートはそのまま公開できません。記録を記入し、template項目を削除してください。",
    );
  }
  if (value.sampleRecord !== undefined && typeof value.sampleRecord !== "boolean") {
    throw new PublicBenchmarkError("sampleRecordはbooleanで指定してください。");
  }
}

function toObservation<T>(
  value: T | null | undefined,
  reason: string,
): Observation<T> {
  return value === null || value === undefined
    ? { status: "not_observed", reason }
    : { status: "observed", value };
}

function timezoneFromDate(value: string | null): string | null {
  if (!value) {
    return null;
  }
  return value.endsWith("Z") ? "UTC" : value.slice(-6);
}

function publicCriteriaFromOllama(
  criteria: Array<{
    id: string;
    label: string;
    description: string;
    scoringMethod: "automatic" | "manual" | "unspecified";
    maxScore: number;
  }>,
  scores: CriterionScore[],
  disclosure: PublicDisclosureOptions,
  status: ExecutionStatus,
): PublicEvaluationCriterion[] {
  const scoreById = new Map(scores.map((score) => [score.criterionId, score]));
  return criteria.map((criterion) => {
    const score = scoreById.get(criterion.id);
    const publicScore: PublicScore =
      status === "not_run"
        ? "not_observed"
        : !score || score.status === "not_scored" || score.score === null
          ? "not_observed"
          : score.score;
    return {
      id: criterion.id,
      label: criterion.label,
      description: {
        status: "observed",
        value: criterion.description,
      },
      scoringMethod: criterion.scoringMethod,
      maxScore: criterion.maxScore,
      score: publicScore,
      evidence:
        status !== "not_run" && disclosure.includeEvidence && score
          ? [score.note]
          : [],
      unobserved:
        publicScore === "not_observed"
          ? ["採点情報が記録されていません。"]
          : [],
      assessorJudgment: {
        status: "not_observed",
        reason: "schemaVersion 1には独立した評価者判断がありません。",
      },
      evidenceReferences: [],
    };
  });
}

function publicCriteriaFromCli(
  record: CliManualRecord,
  disclosure: PublicDisclosureOptions,
): PublicEvaluationCriterion[] {
  return record.evaluation.criteria.map((criterion) => ({
    id: criterion.id,
    label: criterion.label,
    description: { status: "observed", value: criterion.description },
    scoringMethod: criterion.scoringMethod,
    maxScore: criterion.maxScore,
    score: criterion.score,
    evidence: disclosure.includeEvidence ? criterion.evidence : [],
    unobserved: disclosure.includeEvidence ? criterion.unobserved : [],
    assessorJudgment: observationForText(
      criterion.assessorJudgment,
      disclosure.includeJudgments,
      "評価者判断は公開項目として選択されていません。",
      "評価者判断が記録されていません。",
    ),
    evidenceReferences: criterion.evidenceReferences,
  }));
}

function executionStatus(result: BenchmarkResult): ExecutionStatus {
  return (
    result.executionStatus ??
    (result.error
      ? result.error.code === "ABORTED"
        ? "aborted"
        : "failed"
      : "completed")
  );
}

function safeOllamaBaseSettings(
  document: BenchmarkDocument,
  result: BenchmarkResult,
): Record<string, string | number | boolean | null> {
  const settings = result.settings ?? document.request;
  return {
    temperature: settings.temperature,
    seed: settings.seed,
    maxTokens: settings.maxTokens,
    contextLength: settings.contextLength,
    executionCount: settings.executionCount,
    runMode: settings.runMode,
    stream: settings.stream,
    think: settings.think ?? document.request.think ?? false,
  };
}

function executionMeasurement(
  value: number | null,
  status: ExecutionStatus,
  notObservedReason: string,
): Observation<number> {
  return status === "not_run"
    ? {
        status: "not_applicable",
        reason: "実行されていないため測定対象外です。",
      }
    : toObservation(value, notObservedReason);
}

function executionObservation<T>(
  value: T | null | undefined,
  status: ExecutionStatus,
  notObservedReason: string,
): Observation<T> {
  return status === "not_run"
    ? {
        status: "not_applicable",
        reason: "実行されていないため観測対象外です。",
      }
    : toObservation(value, notObservedReason);
}

function mapOllamaExperiment(
  document: BenchmarkDocument,
  result: BenchmarkResult,
  inputSha256: string,
  disclosure: PublicDisclosureOptions,
): PublicBenchmarkExperiment {
  const status = executionStatus(result);
  const startedAt = result.startedAt;
  const criteria: Array<{
    id: string;
    label: string;
    description: string;
    scoringMethod: "automatic" | "manual" | "unspecified";
    maxScore: number;
  }> =
    document.evaluationCriteria?.map((criterion) => ({
      id: criterion.id,
      label: criterion.label,
      description: criterion.description,
      scoringMethod: criterion.scoringMethod,
      maxScore: criterion.maxScore,
    })) ?? [];
  for (const score of result.criterionScores ?? []) {
    if (!criteria.some((criterion) => criterion.id === score.criterionId)) {
      criteria.push({
        id: score.criterionId,
        label: score.label,
        description: "評価基準の説明は記録されていません。",
        scoringMethod: "unspecified",
        maxScore: score.maxScore,
      });
    }
  }
  const scoring = result.scoringStatus ?? "unscored";
  const missingEnvironment: string[] = [];
  const platform = document.environment.platform || null;
  const cpu = document.environment.cpu || null;
  const memory = document.environment.memory || null;
  if (!platform) missingEnvironment.push("OS/platform is not recorded.");
  if (!cpu) missingEnvironment.push("CPU is not recorded.");
  if (!memory) missingEnvironment.push("Memory is not recorded.");

  return {
    id: `${document.benchmarkId}-${encodeURIComponent(result.modelId)}-run-${result.runNumber}`,
    source: { format: "ollama-benchmark-v1", inputSha256 },
    task: {
      id: observed(document.problemId, "問題IDが記録されていません。"),
      setId: observed(document.problemSetId, "課題セットIDが記録されていません。"),
      setVersion: observed(
        document.problemSetVersion,
        "課題セット版が記録されていません。",
      ),
      title: observed(document.problemTitle, "課題タイトルが記録されていません。"),
      prompt: observationForText(
        document.request.prompt,
        disclosure.includeTaskPrompt,
        "問題文は公開項目として選択されていません。",
        "問題文が記録されていません。",
      ),
    },
    time: {
      startedAt:
        status === "not_run"
          ? {
              status: "not_applicable",
              reason: "実行されていないため開始時刻はありません。",
            }
          : observed(startedAt, "開始時刻が記録されていません。"),
      completedAt:
        status === "not_run"
          ? {
              status: "not_applicable",
              reason: "実行されていないため完了時刻はありません。",
            }
          : observed(
              result.finishedAt,
              "完了時刻が記録されていません。",
            ),
      timezone:
        status === "not_run"
          ? {
              status: "not_applicable",
              reason: "実行されていないため実行時刻のタイムゾーンはありません。",
            }
          : observed(
              timezoneFromDate(startedAt),
              "タイムゾーンを取得できません。",
            ),
    },
    model: {
      name: observed(result.displayName, "モデル名が記録されていません。"),
      id: observed(result.modelId, "モデルIDが記録されていません。"),
      version: { status: "not_observed", reason: "モデル版は記録されていません。" },
      provider: { status: "observed", value: "Ollama" },
      selectionMethod: "manual",
      identified: true,
    },
    agent: {
      name: "Local-AI-Benchmark",
      version: observed(
        document.environment.appVersion,
        "アプリバージョンが記録されていません。",
      ),
      interface: "api",
      tools: {
        status: "not_applicable",
        reason: "Ollama APIの直接呼び出しではエージェントツールを使用しません。",
      },
      permissions: {
        status: "not_applicable",
        reason: "CLIエージェント権限は該当しません。",
      },
      humanIntervention: {
        status: "not_observed",
        reason: "実行中の人間介入記録はschemaVersion 1にありません。",
      },
    },
    environment: {
      os: observed(platform, "OS/platformを取得できません。"),
      cpu: observed(cpu, "CPU情報を取得できません。"),
      gpu: { status: "not_observed", reason: "GPU情報は記録されていません。" },
      memory: observed(memory, "メモリ情報を取得できません。"),
      executionMode: "local-ollama",
      unavailable: missingEnvironment.concat([
        "Browser and GPU details are not recorded in schemaVersion 1.",
      ]),
    },
    conditions: {
      id: `ollama-${document.benchmarkId}`,
      settings: {
        ...safeOllamaBaseSettings(document, result),
        ollamaVersion: null,
      },
    },
    execution: {
      status,
      taskOutcome: "indeterminate",
      scoringStatus: scoring,
      automaticScore: executionMeasurement(
        result.automaticScore ?? null,
        status,
        "自動採点結果は記録されていません。",
      ),
      manualScore: executionMeasurement(
        result.manualScore ?? null,
        status,
        "手動採点結果は記録されていません。",
      ),
      response:
        status === "not_run"
          ? {
              status: "not_applicable",
              reason: "実行されていないため回答はありません。",
            }
          : observationForText(
              result.response,
              disclosure.includeResponses,
              "回答は公開項目として選択されていません。",
              "回答が記録されていません。",
            ),
      durationMs: executionMeasurement(
        result.elapsedMs,
        status,
        "所要時間が取得されていません。",
      ),
      modelLoadDurationMs: executionMeasurement(
        result.loadDurationNs === null ? null : result.loadDurationNs / 1_000_000,
        status,
        "モデルロード時間は取得されていません。",
      ),
      promptEvaluationDurationMs: executionMeasurement(
        result.promptEvalDurationNs === null
          ? null
          : result.promptEvalDurationNs / 1_000_000,
        status,
        "入力評価時間は取得されていません。",
      ),
      inputTokens: executionMeasurement(
        result.promptEvalCount,
        status,
        "入力トークン数が取得されていません。",
      ),
      outputTokens: executionMeasurement(
        result.evalCount,
        status,
        "出力トークン数が取得されていません。",
      ),
      generationTokensPerSecond: executionMeasurement(
        result.outputTokensPerSecond,
        status,
        "生成速度が取得されていません。",
      ),
      completionReason: executionObservation(
        result.doneReason,
        status,
        "完了理由は記録されていません。",
      ),
      cost: {
        status: "not_applicable",
        reason: "ローカルOllama結果にコスト情報はありません。",
      },
      tests: [],
      evaluationUnavailable:
        criteria.length === 0
          ? ["評価項目が記録されていません。"]
          : ["schemaVersion 1は独立したテスト結果を保持しません。"],
      errorCode: status === "not_run"
        ? {
            status: "not_applicable",
            reason: "実行されていないため実行時エラーはありません。",
          }
        : result.error
        ? { status: "observed", value: result.error.code }
        : status === "failed" || status === "aborted"
          ? {
              status: "not_observed",
              reason: "失敗状態ですがエラーコードは記録されていません。",
            }
          : {
              status: "not_applicable",
              reason: "失敗エラーは記録されていません。",
            },
    },
    evaluation: {
      protocolId: observed(
        document.problemSetId,
        "評価規約IDが記録されていません。",
      ),
      protocolVersion: observed(
        document.problemSetVersion,
        "評価規約バージョンが記録されていません。",
      ),
      criteria: publicCriteriaFromOllama(
        criteria,
        result.criterionScores ?? [],
        disclosure,
        status,
      ),
    },
    contamination: {
      status: "unknown",
      limitations: [
        "Information contamination was not recorded in schemaVersion 1.",
      ],
    },
    publicReferences: [],
  };
}

function mapCliExperiment(
  record: CliManualRecord,
  inputSha256: string,
  disclosure: PublicDisclosureOptions,
): PublicBenchmarkExperiment {
  const experiment = record.experiment;
  const model = record.model;
  const agent = record.agent;
  const environment = record.environment;
  const execution = record.execution;
  const missingEnvironment = [...environment.unavailable];
  if (!environment.os) missingEnvironment.push("OS is not recorded.");
  if (!environment.cpu) missingEnvironment.push("CPU is not recorded.");
  if (!environment.gpu) missingEnvironment.push("GPU is not recorded.");
  if (!environment.memory) missingEnvironment.push("Memory is not recorded.");

  return {
    id: experiment.id,
    source: { format: "cli-manual-v1", inputSha256 },
    task: {
      id: { status: "observed", value: experiment.taskId },
      setId: observed(experiment.taskSetId, "課題セットIDが記録されていません。"),
      setVersion: observed(
        experiment.taskSetVersion,
        "課題セット版が記録されていません。",
      ),
      title: { status: "observed", value: experiment.taskTitle },
      prompt: observationForText(
        experiment.taskPrompt,
        disclosure.includeTaskPrompt,
        "問題文は公開項目として選択されていません。",
        "問題文が記録されていません。",
      ),
    },
    time: {
      startedAt: executionObservation(
        experiment.startedAt,
        execution.status,
        "開始時刻は未取得です。",
      ),
      completedAt: executionObservation(
        experiment.completedAt,
        execution.status,
        "完了時刻は未取得です。",
      ),
      timezone: executionObservation(
        experiment.timezone ?? timezoneFromDate(experiment.startedAt),
        execution.status,
        "タイムゾーンは未取得です。",
      ),
    },
    model: {
      name: observed(model.name, "モデル名は未取得です。"),
      id: observed(model.id, "モデルIDは未取得です。"),
      version: observed(model.version, "モデルバージョンは未取得です。"),
      provider: observed(model.provider, "モデル提供元は未取得です。"),
      selectionMethod: model.selectionMethod,
      identified: model.name !== null && model.id !== null,
    },
    agent: {
      name: agent.name,
      version: observed(agent.version, "CLI/アプリバージョンは未取得です。"),
      interface: agent.interface,
      tools: observed(agent.tools, "利用可能なツールは未取得です。"),
      permissions: observed(agent.permissions, "実行権限は未取得です。"),
      humanIntervention: observed(
        agent.humanIntervention,
        "人間の介入状況は未取得です。",
      ),
    },
    environment: {
      os: observed(environment.os, "OSは未取得です。"),
      cpu: observed(environment.cpu, "CPUは未取得です。"),
      gpu: observed(environment.gpu, "GPUは未取得です。"),
      memory: observed(environment.memory, "メモリは未取得です。"),
      executionMode: environment.executionMode,
      unavailable: disclosure.includeEvidence
        ? [...new Set(missingEnvironment)]
        : [],
    },
    conditions: {
      id: "pending",
      settings: record.conditions,
    },
    execution: {
      status: execution.status,
      taskOutcome: execution.taskOutcome,
      scoringStatus: execution.scoringStatus,
      automaticScore: executionMeasurement(
        execution.automaticScore,
        execution.status,
        "自動採点結果は未取得です。",
      ),
      manualScore: executionMeasurement(
        execution.manualScore,
        execution.status,
        "手動採点結果は未取得です。",
      ),
      response:
        execution.status === "not_run"
          ? {
              status: "not_applicable",
              reason: "実行されていないため回答はありません。",
            }
          : observationForText(
              execution.response,
              disclosure.includeResponses,
              "回答は公開項目として選択されていません。",
              "回答は未取得です。",
            ),
      durationMs: executionMeasurement(
        execution.durationMs,
        execution.status,
        "所要時間は未取得です。",
      ),
      modelLoadDurationMs: executionMeasurement(
        execution.modelLoadDurationMs,
        execution.status,
        "モデルロード時間は未取得です。",
      ),
      promptEvaluationDurationMs: executionMeasurement(
        execution.promptEvaluationDurationMs,
        execution.status,
        "入力評価時間は未取得です。",
      ),
      inputTokens: executionMeasurement(
        execution.inputTokens,
        execution.status,
        "入力トークン数は未取得です。",
      ),
      outputTokens: executionMeasurement(
        execution.outputTokens,
        execution.status,
        "出力トークン数は未取得です。",
      ),
      generationTokensPerSecond: executionMeasurement(
        execution.generationTokensPerSecond,
        execution.status,
        "生成速度は未取得です。",
      ),
      completionReason:
        execution.status === "not_run"
          ? {
              status: "not_applicable",
              reason: "実行されていないため完了理由はありません。",
            }
          : observed(
              execution.completionReason,
              "完了理由は未取得です。",
            ),
      cost:
        execution.status === "not_run"
          ? {
              status: "not_applicable",
              reason: "実行されていないためコストは発生していません。",
            }
          : toObservation(execution.cost, "コスト情報は未取得です。"),
      tests: execution.tests.map((test) => ({
        name: test.name,
        status: test.status,
        command: observationForText(
          test.command,
          disclosure.includeTestCommands,
          "テストコマンドは公開項目として選択されていません。",
          "テストコマンドは未取得です。",
        ),
        evidence: observationForText(
          test.evidence,
          disclosure.includeEvidence,
          "テスト証拠は公開項目として選択されていません。",
          "テスト証拠は未取得です。",
        ),
      })),
      evaluationUnavailable: disclosure.includeEvidence
        ? execution.evaluationUnavailable
        : [],
      errorCode:
        execution.status === "not_run"
          ? {
              status: "not_applicable",
              reason: "実行されていないため実行時エラーはありません。",
            }
          : observed(
              execution.errorCode,
              "エラーコードは記録されていません。",
            ),
    },
    evaluation: {
      protocolId: observed(
        experiment.evaluationProtocolId,
        "評価規約IDは未取得です。",
      ),
      protocolVersion: observed(
        experiment.evaluationProtocolVersion,
        "評価規約バージョンは未取得です。",
      ),
      criteria: publicCriteriaFromCli(record, disclosure),
    },
    contamination: {
      status: record.contamination.status,
      limitations: disclosure.includeEvidence
        ? [...record.contamination.limitations]
        : [],
    },
    publicReferences: [...record.publicReferences],
  };
}

function getStrings(value: unknown, path = "$"): Array<{ path: string; value: string }> {
  if (typeof value === "string") {
    return [{ path, value }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => getStrings(item, `${path}[${index}]`));
  }
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, item]) =>
      getStrings(item, `${path}.${key}`),
    );
  }
  return [];
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function inspectPublicContent(
  document: PublicBenchmarkDocument,
): PublicContentInspection {
  const blocked = new Set<string>();
  const warnings = new Set<string>();
  const secretPatterns = [
    {
      pattern:
        /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:api[_ -]?key|access[_ -]?token|password|client[_ -]?secret)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{8,}/i,
      label: "credential or private key",
    },
    { pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/, label: "GitHub token" },
    { pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/, label: "API token" },
    { pattern: /https?:\/\/[^/\s:@]+:[^/\s@]+@/i, label: "URL credentials" },
  ];
  const personalPatterns = [
    {
      pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
      label: "email address",
    },
    {
      pattern: /(?:\b[A-Z]:\\Users\\[^\\\s]+|\/(?:Users|home)\/[^/\s]+)/i,
      label: "local user path",
    },
  ];
  for (const item of getStrings(document)) {
    for (const candidate of secretPatterns) {
      if (candidate.pattern.test(item.value)) {
        blocked.add(`${candidate.label} detected in ${item.path}`);
      }
    }
    for (const candidate of personalPatterns) {
      if (candidate.pattern.test(item.value)) {
        warnings.add(`${candidate.label} may be present in ${item.path}`);
      }
    }
  }
  return { blocked: [...blocked], warnings: [...warnings] };
}

function validatePublicDocument(
  document: PublicBenchmarkDocument,
): void {
  if (
    document.format !== PUBLIC_BENCHMARK_FORMAT ||
    document.schemaVersion !== 1 ||
    !["user_recorded", "synthetic_sample"].includes(document.dataKind) ||
    document.experiments.length === 0
  ) {
    throw new PublicBenchmarkError("公開データ形式または実験データが不正です。");
  }
  const ids = new Set<string>();
  for (const experiment of document.experiments) {
    if (!experiment.id || ids.has(experiment.id)) {
      throw new PublicBenchmarkError("実験IDが空または重複しています。");
    }
    ids.add(experiment.id);
    for (const criterion of experiment.evaluation.criteria) {
      if (
        !Number.isFinite(criterion.maxScore) ||
        !Number.isInteger(criterion.maxScore) ||
        criterion.maxScore <= 0 ||
        (typeof criterion.score === "number" &&
          (!Number.isFinite(criterion.score) ||
            !Number.isInteger(criterion.score) ||
            criterion.score < 0 ||
            criterion.score > criterion.maxScore))
      ) {
        throw new PublicBenchmarkError("評価点または配点が不正です。");
      }
    }
  }
}

export async function sha256Hex(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new PublicBenchmarkError(
      "この環境ではSHA-256を計算できないため、公開用JSONを生成できません。",
    );
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function createPublicBenchmarkDocument({
  input,
  inputText,
  disclosure = DEFAULT_PUBLIC_DISCLOSURE,
}: {
  input: unknown;
  inputText: string;
  disclosure?: PublicDisclosureOptions;
}): Promise<PublicBenchmarkDocument> {
  let experiments: PublicBenchmarkExperiment[];
  let dataKind: PublicBenchmarkDocument["dataKind"] = "user_recorded";
  const inputSha256 = await sha256Hex(inputText);
  if (isRecord(input) && input.schemaVersion === 1) {
    const source = validateOllamaInput(input);
    dataKind =
      isRecord(input) && input.sampleRecord === true
        ? "synthetic_sample"
        : "user_recorded";
    experiments = source.results.map((result) =>
      mapOllamaExperiment(source, result, inputSha256, disclosure),
    );
  } else if (isRecord(input) && input.format === CLI_RECORD_FORMAT) {
    validateCliRecord(input);
    dataKind = input.sampleRecord === true ? "synthetic_sample" : "user_recorded";
    experiments = [
      mapCliExperiment(input, inputSha256, disclosure),
    ];
  } else {
    throw new PublicBenchmarkError(
      "未対応の入力形式です。Ollama schemaVersion 1またはbenchmark-cli-record/v1を指定してください。",
    );
  }
  const document: PublicBenchmarkDocument = {
    format: PUBLIC_BENCHMARK_FORMAT,
    schemaVersion: 1,
    dataKind,
    experiments,
  };
  for (const experiment of document.experiments) {
    const conditionsFingerprint = JSON.stringify(canonicalize({
      model: experiment.model,
      agent: experiment.agent,
      environment: {
        os: experiment.environment.os,
        cpu: experiment.environment.cpu,
        gpu: experiment.environment.gpu,
        memory: experiment.environment.memory,
        executionMode: experiment.environment.executionMode,
      },
      conditions: experiment.conditions.settings,
    }));
    experiment.conditions.id = await sha256Hex(conditionsFingerprint);
  }
  validatePublicDocument(document);
  return document;
}

function isObservation(
  value: unknown,
  valueValidator: (candidate: unknown) => boolean,
): boolean {
  return (
    isRecord(value) &&
    ((value.status === "observed" && valueValidator(value.value)) ||
      ((value.status === "not_observed" ||
        value.status === "not_applicable") &&
        isString(value.reason) &&
        value.reason.length > 0))
  );
}

function isStringObservation(value: unknown): boolean {
  return isObservation(value, isString);
}

function isNumberObservation(value: unknown): boolean {
  return isObservation(value, isFiniteNonNegative);
}

function isIntegerObservation(value: unknown): boolean {
  return isObservation(value, isNonNegativeInteger);
}

function isPublicCriterion(value: unknown): value is PublicEvaluationCriterion {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.label) &&
    isStringObservation(value.description) &&
    ["automatic", "manual", "unspecified"].includes(
      String(value.scoringMethod),
    ) &&
    isFiniteNonNegative(value.maxScore) &&
    value.maxScore > 0 &&
    isPublicScore(value.score, value.maxScore) &&
    isStringArray(value.evidence) &&
    isStringArray(value.unobserved) &&
    isStringArray(value.evidenceReferences) &&
    isStringObservation(value.assessorJudgment)
  );
}

export function validatePublicBenchmarkDocument(
  value: unknown,
): asserts value is PublicBenchmarkDocument {
  if (
    !isRecord(value) ||
    value.format !== PUBLIC_BENCHMARK_FORMAT ||
    value.schemaVersion !== 1 ||
    !["user_recorded", "synthetic_sample"].includes(String(value.dataKind)) ||
    !Array.isArray(value.experiments) ||
    value.experiments.length === 0
  ) {
    throw new PublicBenchmarkError(
      "benchmark-public/v1の公開用JSONではありません。",
    );
  }
  for (const [index, experiment] of value.experiments.entries()) {
    if (
      !isRecord(experiment) ||
      !isString(experiment.id) ||
      !/^[A-Za-z0-9][A-Za-z0-9._:%-]{0,255}$/.test(experiment.id) ||
      !experiment.id ||
      !isRecord(experiment.source) ||
      !["ollama-benchmark-v1", "cli-manual-v1"].includes(
        String(experiment.source.format),
      ) ||
      !isString(experiment.source.inputSha256) ||
      !/^[a-f0-9]{64}$/.test(experiment.source.inputSha256) ||
      !isRecord(experiment.task) ||
      !isStringObservation(experiment.task.id) ||
      !isStringObservation(experiment.task.setId) ||
      !isStringObservation(experiment.task.setVersion) ||
      !isStringObservation(experiment.task.title) ||
      !isStringObservation(experiment.task.prompt) ||
      !isRecord(experiment.time) ||
      !isStringObservation(experiment.time.startedAt) ||
      !isStringObservation(experiment.time.completedAt) ||
      !isStringObservation(experiment.time.timezone) ||
      !isRecord(experiment.model) ||
      !isStringObservation(experiment.model.name) ||
      !isStringObservation(experiment.model.id) ||
      !isStringObservation(experiment.model.version) ||
      !isStringObservation(experiment.model.provider) ||
      !["manual", "automatic", "unknown"].includes(
        String(experiment.model.selectionMethod),
      ) ||
      typeof experiment.model.identified !== "boolean" ||
      !isRecord(experiment.agent) ||
      !isString(experiment.agent.name) ||
      !isStringObservation(experiment.agent.version) ||
      !PUBLIC_INTERFACE_TYPES.has(String(experiment.agent.interface)) ||
      !isObservation(
        experiment.agent.tools,
        (candidate) => candidate === null || isStringArray(candidate),
      ) ||
      !isStringObservation(experiment.agent.permissions) ||
      !isStringObservation(experiment.agent.humanIntervention) ||
      !isRecord(experiment.environment) ||
      !isStringObservation(experiment.environment.os) ||
      !isStringObservation(experiment.environment.cpu) ||
      !isStringObservation(experiment.environment.gpu) ||
      !isStringObservation(experiment.environment.memory) ||
      !isString(experiment.environment.executionMode) ||
      !isStringArray(experiment.environment.unavailable) ||
      !isRecord(experiment.conditions) ||
      !isString(experiment.conditions.id) ||
      !/^[a-f0-9]{64}$/.test(experiment.conditions.id) ||
      !isPublicConditionSettings(experiment.conditions.settings) ||
      !isRecord(experiment.execution) ||
      !EXECUTION_STATUSES.has(
        experiment.execution.status as ExecutionStatus,
      ) ||
      !TASK_OUTCOMES.has(String(experiment.execution.taskOutcome)) ||
      !SCORING_STATUSES.has(
        experiment.execution.scoringStatus as ScoringStatus,
      ) ||
      !isNumberObservation(experiment.execution.automaticScore) ||
      !isNumberObservation(experiment.execution.manualScore) ||
      !isStringObservation(experiment.execution.response) ||
      !isNumberObservation(experiment.execution.durationMs) ||
      !isNumberObservation(experiment.execution.modelLoadDurationMs) ||
      !isNumberObservation(experiment.execution.promptEvaluationDurationMs) ||
      !isIntegerObservation(experiment.execution.inputTokens) ||
      !isIntegerObservation(experiment.execution.outputTokens) ||
      !isNumberObservation(
        experiment.execution.generationTokensPerSecond,
      ) ||
      !isStringObservation(experiment.execution.completionReason) ||
      !isObservation(
        experiment.execution.cost,
        (candidate) =>
          isRecord(candidate) &&
          isFiniteNonNegative(candidate.amount) &&
          isString(candidate.currency) &&
          /^[A-Z]{3}$/.test(candidate.currency),
      ) ||
      !Array.isArray(experiment.execution.tests) ||
      !experiment.execution.tests.every(
        (candidate) =>
          isRecord(candidate) &&
          isString(candidate.name) &&
          TEST_STATUSES.has(String(candidate.status)) &&
          isStringObservation(candidate.command) &&
          isStringObservation(candidate.evidence),
      ) ||
      !isStringArray(experiment.execution.evaluationUnavailable) ||
      !isStringObservation(experiment.execution.errorCode) ||
      !isRecord(experiment.evaluation) ||
      !isStringObservation(experiment.evaluation.protocolId) ||
      !isStringObservation(experiment.evaluation.protocolVersion) ||
      !Array.isArray(experiment.evaluation.criteria) ||
      !experiment.evaluation.criteria.every(isPublicCriterion) ||
      !isRecord(experiment.contamination) ||
      !CONTAMINATION_STATUSES.has(
        String(experiment.contamination.status),
      ) ||
      !isStringArray(experiment.contamination.limitations) ||
      !isStringArray(experiment.publicReferences)
    ) {
      throw new PublicBenchmarkError(`experiments[${index}]が不正です。`);
    }
    const execution = experiment.execution;
    const hasRecordedEvaluation =
      experiment.evaluation.criteria.some(
        (criterion) =>
          isRecord(criterion) &&
          typeof criterion.score === "number" &&
          criterion.score > 0,
      ) ||
      experiment.execution.tests.some(
        (candidate) => isRecord(candidate) && candidate.status === "passed",
      );
    if (
      execution.taskOutcome === "success" &&
      (execution.status !== "completed" || !hasRecordedEvaluation)
    ) {
      throw new PublicBenchmarkError(
        `experiments[${index}]の成功判定に完了状態または観測証拠がありません。`,
      );
    }
    if (
      execution.status === "not_run" &&
      [
        execution.automaticScore,
        execution.manualScore,
        execution.durationMs,
        execution.modelLoadDurationMs,
        execution.promptEvaluationDurationMs,
        execution.inputTokens,
        execution.outputTokens,
        execution.generationTokensPerSecond,
        execution.completionReason,
        execution.cost,
        execution.errorCode,
      ].some(
        (observation) =>
          !isRecord(observation) ||
          observation.status !== "not_applicable",
      )
    ) {
      throw new PublicBenchmarkError(
        `experiments[${index}]のnot_runに実測値が含まれています。`,
      );
    }
    if (
      execution.status === "not_run" &&
      (execution.taskOutcome === "success" ||
        execution.taskOutcome === "failure" ||
        !isRecord(experiment.execution.response) ||
        experiment.execution.response.status !== "not_applicable" ||
        !isRecord(experiment.time.startedAt) ||
        experiment.time.startedAt.status !== "not_applicable" ||
        !isRecord(experiment.time.completedAt) ||
        experiment.time.completedAt.status !== "not_applicable" ||
        !isRecord(experiment.time.timezone) ||
        experiment.time.timezone.status !== "not_applicable" ||
        experiment.evaluation.criteria.some(
          (criterion) => typeof criterion.score === "number",
        ) ||
        experiment.execution.tests.some(
          (test) => test.status === "passed" || test.status === "failed",
        ))
    ) {
      throw new PublicBenchmarkError(
        `experiments[${index}]のnot_runに実行済みの回答・評価情報があります。`,
      );
    }
  }
  const experimentIds = value.experiments
    .map((experiment) => (isRecord(experiment) ? experiment.id : null))
    .filter(isString);
  if (new Set(experimentIds).size !== experimentIds.length) {
    throw new PublicBenchmarkError("実験IDが重複しています。");
  }
  validatePublicDocument(value as unknown as PublicBenchmarkDocument);
}

export function serializePublicBenchmarkDocument(
  document: PublicBenchmarkDocument,
): string {
  validatePublicBenchmarkDocument(document);
  return `${JSON.stringify(document, null, 2)}\n`;
}

export async function createIntegrityManifest({
  fileName,
  serializedDocument,
}: {
  fileName: string;
  serializedDocument: string;
}): Promise<PublicIntegrityManifest> {
  return {
    format: "benchmark-public-manifest/v1",
    fileName,
    algorithm: "SHA-256",
    sha256: await sha256Hex(serializedDocument),
    scope: "exact downloaded UTF-8 JSON file bytes",
    limitation:
      "SHA-256 verifies file identity only; it does not verify measurement accuracy or content safety.",
  };
}

export async function verifyIntegrityManifest({
  manifest,
  serializedDocument,
}: {
  manifest: unknown;
  serializedDocument: string;
}): Promise<boolean> {
  if (
    !isRecord(manifest) ||
    manifest.format !== "benchmark-public-manifest/v1" ||
    manifest.algorithm !== "SHA-256" ||
    manifest.scope !== "exact downloaded UTF-8 JSON file bytes" ||
    !isString(manifest.fileName) ||
    !/^[a-zA-Z0-9._-]+\.json$/.test(manifest.fileName) ||
    !isString(manifest.sha256) ||
    !/^[a-f0-9]{64}$/.test(manifest.sha256)
  ) {
    throw new PublicBenchmarkError("SHA-256 manifestの形式が不正です。");
  }
  return (await sha256Hex(serializedDocument)) === manifest.sha256;
}

export function publicBenchmarkFileName(
  document: PublicBenchmarkDocument,
): string {
  const id = document.experiments[0].id.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `${id}-benchmark-public-v1.json`;
}
