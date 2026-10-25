import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PHASE2_PROBLEM_SET } from "../src/data/phase2-problems.ts";
import { createBenchmarkDocument } from "../src/lib/benchmark-document.ts";
import {
  createIntegrityManifest,
  createPublicBenchmarkDocument,
  DEFAULT_PUBLIC_DISCLOSURE,
  inspectPublicContent,
  serializePublicBenchmarkDocument,
  verifyIntegrityManifest,
  validatePublicBenchmarkDocument,
} from "../src/lib/public-benchmark.ts";
import type {
  BenchmarkResult,
  BenchmarkSettings,
} from "../src/types/benchmark.ts";
import type {
  CliManualRecord,
  PublicDisclosureOptions,
} from "../src/types/public-benchmark.ts";

const settings: BenchmarkSettings = {
  systemPrompt: "secret system prompt must not be copied",
  temperature: 0,
  seed: 42,
  maxTokens: 512,
  contextLength: 4096,
  executionCount: 1,
  runMode: "warm",
  stream: false,
  think: false,
};

async function readSampleOllama() {
  const text = await readFile(
    new URL("../examples/sample-result.json", import.meta.url),
    "utf8",
  );
  return { input: JSON.parse(text) as unknown, text };
}

async function readSampleCli() {
  const text = await readFile(
    new URL("../examples/sample-cli-record.json", import.meta.url),
    "utf8",
  );
  return { input: JSON.parse(text) as unknown, text };
}

function disclosure(
  overrides: Partial<PublicDisclosureOptions> = {},
): PublicDisclosureOptions {
  return { ...DEFAULT_PUBLIC_DISCLOSURE, ...overrides };
}

function sampleResult(overrides: Partial<BenchmarkResult> = {}): BenchmarkResult {
  return {
    modelId: "qwen3.5:latest",
    displayName: "Qwen 3.5",
    runNumber: 1,
    response: "Public-safe sample response.",
    thinking: "Never disclose private chain of thought.",
    settings,
    startedAt: "2026-10-25T09:00:00.000+09:00",
    finishedAt: "2026-10-25T09:00:01.000+09:00",
    elapsedMs: 1_000,
    totalDurationNs: 1_000_000_000,
    loadDurationNs: 100_000_000,
    promptEvalCount: 12,
    promptEvalDurationNs: 100_000_000,
    evalCount: 24,
    evalDurationNs: 800_000_000,
    promptTokensPerSecond: 120,
    outputTokensPerSecond: 30,
    doneReason: "stop",
    error: null,
    ...overrides,
  };
}

function ollamaDocument(results: BenchmarkResult[]) {
  return createBenchmarkDocument({
    createdAt: "2026-10-25T00:00:00.000Z",
    completedAt: "2026-10-25T00:00:02.000Z",
    ollamaBaseUrl: "http://localhost:11434",
    prompt: "A public-safe example prompt.",
    settings,
    results,
  });
}

test("schemaVersion 1のOllama結果をallowlistで変換し未観測を保持する", async () => {
  const { input, text } = await readSampleOllama();
  const document = await createPublicBenchmarkDocument({ input, inputText: text });
  const experiment = document.experiments[0];
  const serialized = serializePublicBenchmarkDocument(document);

  assert.equal(document.format, "benchmark-public/v1");
  assert.equal(document.dataKind, "synthetic_sample");
  assert.equal(experiment.source.format, "ollama-benchmark-v1");
  assert.equal(experiment.execution.status, "completed");
  assert.equal(experiment.execution.taskOutcome, "indeterminate");
  assert.equal(experiment.execution.inputTokens.status, "observed");
  assert.equal(experiment.execution.durationMs.status, "observed");
  assert.equal(experiment.execution.cost.status, "not_applicable");
  assert.equal(experiment.task.prompt.status, "not_observed");
  assert.equal(experiment.execution.response.status, "not_observed");
  assert.equal(experiment.agent.tools.status, "not_applicable");
  assert.equal(experiment.contamination.status, "unknown");
  assert.ok(experiment.environment.unavailable.length > 0);
  assert.equal(experiment.source.inputSha256.length, 64);
  assert.equal(experiment.conditions.id.length, 64);
  assert.equal(serialized.includes("systemPrompt"), false);
  assert.equal(serialized.includes("ollamaBaseUrl"), false);
  assert.equal(serialized.includes("thinking"), false);
  assert.equal(serialized.includes("これは実測値ではないサンプル回答です。"), false);
  assert.doesNotMatch(serialized, /local-ai-benchmark\.example/);
  validatePublicBenchmarkDocument(JSON.parse(serialized) as unknown);
});

test("明示選択したプロンプトと回答だけを公開射影へ含める", async () => {
  const { input, text } = await readSampleOllama();
  const result = await createPublicBenchmarkDocument({
    input,
    inputText: text,
    disclosure: disclosure({
      includeTaskPrompt: true,
      includeResponses: true,
    }),
  });
  assert.equal(result.experiments[0].task.prompt.status, "observed");
  assert.equal(result.experiments[0].execution.response.status, "observed");
  assert.equal(
    result.experiments[0].task.prompt.status === "observed"
      ? result.experiments[0].task.prompt.value
      : "",
    "ローカルAIの利点を簡潔に説明してください。",
  );
});

test("failed・aborted・not_runとゼロ点を成功や未観測へ誤変換しない", async () => {
  const base = sampleResult({
    automaticScore: 0,
    manualScore: null,
    scoringStatus: "partial",
    criterionScores: [
      {
        criterionId: "sample",
        label: "形式",
        status: "failed",
        score: 0,
        maxScore: 4,
        note: "客観的な条件を満たしませんでした。",
      },
      {
        criterionId: "human",
        label: "内容",
        status: "manual_required",
        score: null,
        maxScore: 4,
        note: "未採点",
      },
    ],
  });
  const results: BenchmarkResult[] = [
    base,
    {
      ...base,
      modelId: "failed-model",
      displayName: "Failed",
      executionStatus: "failed",
      error: { code: "TIMEOUT", message: "private error text" },
      promptEvalCount: null,
      evalCount: null,
      automaticScore: null,
      scoringStatus: "unscored",
      criterionScores: [],
    },
    {
      ...base,
      modelId: "aborted-model",
      displayName: "Aborted",
      executionStatus: "aborted",
      error: { code: "ABORTED", message: "cancelled" },
      automaticScore: null,
      scoringStatus: "unscored",
      criterionScores: [],
    },
    {
      ...base,
      modelId: "not-run-model",
      displayName: "Not run",
      executionStatus: "not_run",
      error: null,
      elapsedMs: 0,
      automaticScore: null,
      scoringStatus: "unscored",
      criterionScores: [],
    },
  ];
  const input = ollamaDocument(results);
  const text = JSON.stringify(input);
  const document = await createPublicBenchmarkDocument({ input, inputText: text });
  const [completed, failed, aborted, notRun] = document.experiments;

  assert.equal(completed.execution.status, "completed");
  assert.equal(completed.execution.taskOutcome, "indeterminate");
  assert.deepEqual(completed.execution.automaticScore, {
    status: "observed",
    value: 0,
  });
  assert.equal(completed.evaluation.criteria[0].score, 0);
  assert.equal(completed.evaluation.criteria[1].score, "not_observed");
  assert.equal(failed.execution.status, "failed");
  assert.deepEqual(failed.execution.errorCode, {
    status: "observed",
    value: "TIMEOUT",
  });
  assert.equal(
    JSON.stringify(failed).includes("private error text"),
    false,
  );
  assert.equal(aborted.execution.status, "aborted");
  assert.equal(notRun.execution.status, "not_run");
  assert.deepEqual(notRun.execution.durationMs, {
    status: "not_applicable",
    reason: "実行されていないため測定対象外です。",
  });
  assert.equal(notRun.execution.response.status, "not_applicable");
  assert.equal(notRun.execution.errorCode.status, "not_applicable");
});

test("Phase 2の評価基準とゼロ点・手動未採点を分離して変換する", async () => {
  const problem = PHASE2_PROBLEM_SET.problems[0];
  const result = sampleResult({
    automaticScore: 0,
    manualScore: null,
    scoringStatus: "partial",
    criterionScores: [
      {
        criterionId: problem.evaluationCriteria[0].id,
        label: problem.evaluationCriteria[0].label,
        status: "failed",
        score: 0,
        maxScore: 4,
        note: "形式的な評価に失敗しました。",
      },
    ],
  });
  const input = createBenchmarkDocument({
    createdAt: "2026-10-25T00:00:00.000Z",
    completedAt: "2026-10-25T00:00:02.000Z",
    ollamaBaseUrl: "http://localhost:11434",
    prompt: problem.prompt,
    settings,
    results: [result],
    benchmarkMode: "phase2",
    problem,
  });
  const document = await createPublicBenchmarkDocument({
    input,
    inputText: JSON.stringify(input),
  });

  assert.equal(document.experiments[0].task.setId.status, "observed");
  assert.equal(document.experiments[0].task.setVersion.status, "observed");
  assert.equal(document.experiments[0].evaluation.criteria.length, 3);
  assert.equal(document.experiments[0].evaluation.criteria[0].score, 0);
  assert.equal(document.experiments[0].evaluation.criteria[1].score, "not_observed");
  assert.equal(document.experiments[0].execution.taskOutcome, "indeterminate");
});

test("CLI JSON記録は8項目・N/O・汚染制約を維持し合成データを識別する", async () => {
  const { input, text } = await readSampleCli();
  const document = await createPublicBenchmarkDocument({
    input,
    inputText: text,
    disclosure: disclosure({
      includeTaskPrompt: true,
      includeResponses: true,
      includeEvidence: true,
      includeJudgments: true,
    }),
  });
  const experiment = document.experiments[0];

  assert.equal(document.dataKind, "synthetic_sample");
  assert.equal(experiment.source.format, "cli-manual-v1");
  assert.equal(experiment.agent.name, "Example CLI Agent");
  assert.equal(experiment.model.identified, true);
  assert.equal(experiment.evaluation.criteria.length, 8);
  assert.equal(
    experiment.evaluation.criteria[0].description.status,
    "observed",
  );
  assert.equal(experiment.evaluation.criteria[5].score, "not_observed");
  assert.equal(experiment.contamination.status, "unknown");
  assert.equal(experiment.task.prompt.status, "observed");
  assert.equal(experiment.execution.response.status, "observed");
  assert.equal(experiment.execution.tests[0].status, "not_run");
  assert.equal(experiment.execution.inputTokens.status, "not_observed");
  assert.equal(experiment.execution.cost.status, "not_observed");
  validatePublicBenchmarkDocument(document);
});

test("未知形式、不正状態、範囲外点、未実行成功を拒否する", async () => {
  const { input, text } = await readSampleCli();
  const record = input as CliManualRecord;
  await assert.rejects(
    createPublicBenchmarkDocument({
      input: { ...record, format: "future/v99" },
      inputText: text,
    }),
    /未対応の入力形式/,
  );
  const invalidStatus = structuredClone(record);
  invalidStatus.execution.status = "succeeded" as CliManualRecord["execution"]["status"];
  await assert.rejects(
    createPublicBenchmarkDocument({
      input: invalidStatus,
      inputText: JSON.stringify(invalidStatus),
    }),
    /必須項目または値が不正/,
  );
  const invalidScore = structuredClone(record);
  invalidScore.evaluation.criteria[0].score = 5;
  await assert.rejects(
    createPublicBenchmarkDocument({
      input: invalidScore,
      inputText: JSON.stringify(invalidScore),
    }),
    /0〜4点/,
  );
  const invalidNumber = structuredClone(record);
  invalidNumber.execution.durationMs = Number.NaN;
  const invalidNumberBefore = JSON.stringify(invalidNumber);
  await assert.rejects(
    createPublicBenchmarkDocument({
      input: invalidNumber,
      inputText: invalidNumberBefore,
    }),
    /必須項目または値が不正/,
  );
  assert.equal(JSON.stringify(invalidNumber), invalidNumberBefore);
  const secretCondition = structuredClone(record);
  secretCondition.conditions.apiKey = "not-a-real-key";
  await assert.rejects(
    createPublicBenchmarkDocument({
      input: secretCondition,
      inputText: JSON.stringify(secretCondition),
    }),
    /CLI評価記録/,
  );
  const falseSuccess = structuredClone(record);
  falseSuccess.execution.status = "not_run";
  falseSuccess.execution.taskOutcome = "success";
  await assert.rejects(
    createPublicBenchmarkDocument({
      input: falseSuccess,
      inputText: JSON.stringify(falseSuccess),
    }),
    /未完了の実行を成功/,
  );
  const unobservedSuccess = structuredClone(record);
  unobservedSuccess.execution.taskOutcome = "success";
  unobservedSuccess.evaluation.criteria.forEach((criterion) => {
    criterion.score = "not_observed";
  });
  await assert.rejects(
    createPublicBenchmarkDocument({
      input: unobservedSuccess,
      inputText: JSON.stringify(unobservedSuccess),
    }),
    /成功判定には/,
  );
  const notRun = structuredClone(record);
  notRun.execution.status = "not_run";
  notRun.execution.taskOutcome = "failure";
  notRun.execution.durationMs = null;
  notRun.execution.response = null;
  notRun.execution.automaticScore = null;
  notRun.execution.manualScore = null;
  notRun.execution.modelLoadDurationMs = null;
  notRun.execution.promptEvaluationDurationMs = null;
  notRun.execution.inputTokens = null;
  notRun.execution.outputTokens = null;
  notRun.execution.generationTokensPerSecond = null;
  notRun.execution.completionReason = null;
  notRun.execution.cost = null;
  notRun.execution.errorCode = null;
  await assert.rejects(
    createPublicBenchmarkDocument({
      input: notRun,
      inputText: JSON.stringify(notRun),
    }),
    /未実行の試行を失敗/,
  );
  notRun.execution.taskOutcome = "indeterminate";
  notRun.execution.tests.forEach((run) => {
    run.status = "not_run";
  });
  notRun.evaluation.criteria.forEach((criterion) => {
    criterion.score = "not_observed";
  });
  const notRunOutput = await createPublicBenchmarkDocument({
    input: notRun,
    inputText: JSON.stringify(notRun),
  });
  assert.equal(
    notRunOutput.experiments[0].execution.durationMs.status,
    "not_applicable",
  );
  assert.ok(
    notRunOutput.experiments[0].evaluation.criteria.every(
      (criterion) => criterion.score === "not_observed",
    ),
  );
  const template = JSON.parse(
    await readFile(
      new URL("../public/cli-record-template.json", import.meta.url),
      "utf8",
    ),
  ) as unknown;
  await assert.rejects(
    createPublicBenchmarkDocument({
      input: template,
      inputText: JSON.stringify(template),
    }),
    /テンプレートはそのまま公開できません/,
  );
});

test("高確度の秘密パターンをブロックしPII候補は警告する", async () => {
  const input = {
    ...(await readSampleCli()).input as CliManualRecord,
    sampleRecord: false,
  };
  input.execution.response = "example ghp_abcdefghijklmnopqrstuvwxyz0123456789";
  input.evaluation.criteria[0].unobserved = [
    "Local fixture at C:\\Users\\researcher\\answer-key.txt was not inspected.",
  ];
  const defaultDisclosureDocument = await createPublicBenchmarkDocument({
    input,
    inputText: JSON.stringify(input),
  });
  assert.equal(
    JSON.stringify(defaultDisclosureDocument).includes("answer-key.txt"),
    false,
  );
  const disclosedNotesDocument = await createPublicBenchmarkDocument({
    input,
    inputText: JSON.stringify(input),
    disclosure: disclosure({ includeEvidence: true }),
  });
  assert.equal(
    JSON.stringify(disclosedNotesDocument).includes("answer-key.txt"),
    true,
  );
  const serializedInput = JSON.stringify(input);
  const document = await createPublicBenchmarkDocument({
    input,
    inputText: serializedInput,
    disclosure: disclosure({ includeResponses: true }),
  });
  const inspection = inspectPublicContent(document);
  assert.ok(inspection.blocked.some((entry) => entry.includes("GitHub token")));

  input.execution.response = "Contact test.person@example.org for details.";
  const emailDocument = await createPublicBenchmarkDocument({
    input,
    inputText: JSON.stringify(input),
    disclosure: disclosure({ includeResponses: true }),
  });
  const emailInspection = inspectPublicContent(emailDocument);
  assert.equal(emailInspection.blocked.length, 0);
  assert.ok(emailInspection.warnings.some((entry) => entry.includes("email")));
});

test("未知の元フィールドは公開射影へ複製しない", async () => {
  const { input, text } = await readSampleOllama();
  assert.ok(typeof input === "object" && input !== null);
  const extended = {
    ...(input as Record<string, unknown>),
    privateInternalNote: "should never appear",
  };
  const document = await createPublicBenchmarkDocument({
    input: extended,
    inputText: JSON.stringify(extended),
  });
  assert.equal(JSON.stringify(document).includes("privateInternalNote"), false);
  assert.equal(JSON.stringify(document).includes("should never appear"), false);
  assert.notEqual(text, JSON.stringify(extended));
});

test("出力とSHA-256 manifestは同じ入力で決定的、改変を検出する", async () => {
  const { input, text } = await readSampleCli();
  const first = await createPublicBenchmarkDocument({ input, inputText: text });
  const second = await createPublicBenchmarkDocument({ input, inputText: text });
  const firstJson = serializePublicBenchmarkDocument(first);
  const secondJson = serializePublicBenchmarkDocument(second);
  const firstManifest = await createIntegrityManifest({
    fileName: "example.json",
    serializedDocument: firstJson,
  });
  const secondManifest = await createIntegrityManifest({
    fileName: "example.json",
    serializedDocument: secondJson,
  });
  const tamperedManifest = await createIntegrityManifest({
    fileName: "example.json",
    serializedDocument: firstJson.replace("indeterminate", "failure"),
  });

  assert.equal(firstJson, secondJson);
  assert.deepEqual(firstManifest, secondManifest);
  assert.equal(firstManifest.algorithm, "SHA-256");
  assert.notEqual(firstManifest.sha256, tamperedManifest.sha256);
  assert.equal(
    await verifyIntegrityManifest({
      manifest: firstManifest,
      serializedDocument: firstJson,
    }),
    true,
  );
  assert.equal(
    await verifyIntegrityManifest({
      manifest: firstManifest,
      serializedDocument: firstJson.replace("indeterminate", "failure"),
    }),
    false,
  );
  assert.match(firstManifest.limitation, /does not verify measurement accuracy/);
});

test("条件設定キー順が異なっても条件IDは一致する", async () => {
  const { input, text } = await readSampleCli();
  const record = input as CliManualRecord;
  const reordered = {
    ...record,
    conditions: Object.fromEntries(
      Object.entries(record.conditions).reverse(),
    ),
  };
  const first = await createPublicBenchmarkDocument({ input, inputText: text });
  const second = await createPublicBenchmarkDocument({
    input: reordered,
    inputText: JSON.stringify(reordered),
  });
  const disclosed = await createPublicBenchmarkDocument({
    input,
    inputText: text,
    disclosure: disclosure({ includeEvidence: true }),
  });
  assert.equal(
    first.experiments[0].conditions.id,
    second.experiments[0].conditions.id,
  );
  assert.equal(
    first.experiments[0].conditions.id,
    disclosed.experiments[0].conditions.id,
  );
});

test("公開形式の不正な状態・点数・メタデータを検証で拒否する", async () => {
  const { input, text } = await readSampleCli();
  const document = await createPublicBenchmarkDocument({ input, inputText: text });
  const wrongState = structuredClone(document) as unknown as Record<
    string,
    unknown
  >;
  const experiments = wrongState.experiments as Array<Record<string, unknown>>;
  const execution = experiments[0].execution as Record<string, unknown>;
  execution.status = "success";
  assert.throws(
    () => validatePublicBenchmarkDocument(wrongState),
    /experiments\[0\]が不正/,
  );

  const wrongScore = structuredClone(document);
  wrongScore.experiments[0].evaluation.criteria[0].score = 5;
  assert.throws(
    () => validatePublicBenchmarkDocument(wrongScore),
    /experiments\[0\]が不正|評価点/,
  );

  const notRunWithMeasurements = structuredClone(document);
  notRunWithMeasurements.experiments[0].execution.status = "not_run";
  notRunWithMeasurements.experiments[0].execution.taskOutcome =
    "indeterminate";
  assert.throws(
    () => validatePublicBenchmarkDocument(notRunWithMeasurements),
    /not_run/,
  );
});

test("公開用合成サンプルはsynthetic_sampleと形式検証済みデータとして明示される", async () => {
  const text = await readFile(
    new URL("../examples/sample-public-benchmark.json", import.meta.url),
    "utf8",
  );
  const document: unknown = JSON.parse(text);
  validatePublicBenchmarkDocument(document);
  assert.equal(document.dataKind, "synthetic_sample");
  assert.equal(document.experiments.length, 1);
  assert.equal(
    document.experiments[0].execution.response.status,
    "not_observed",
  );
  assert.equal(document.experiments[0].contamination.status, "unknown");
});
