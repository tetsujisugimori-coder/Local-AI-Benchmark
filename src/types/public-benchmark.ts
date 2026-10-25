export const PUBLIC_BENCHMARK_FORMAT = "benchmark-public/v1" as const;
export const CLI_RECORD_FORMAT = "benchmark-cli-record/v1" as const;

export type Observation<T> =
  | { status: "observed"; value: T }
  | { status: "not_observed"; reason: string }
  | { status: "not_applicable"; reason: string };

export type PublicExecutionStatus =
  | "completed"
  | "failed"
  | "aborted"
  | "not_run";

export type PublicScore = number | "not_observed" | "not_applicable";

export type PublicEvaluationCriterion = {
  id: string;
  label: string;
  description: Observation<string>;
  scoringMethod: "automatic" | "manual" | "unspecified";
  maxScore: number;
  score: PublicScore;
  evidence: string[];
  unobserved: string[];
  assessorJudgment: Observation<string>;
  evidenceReferences: string[];
};

export type PublicBenchmarkExperiment = {
  id: string;
  source: {
    format: "ollama-benchmark-v1" | "cli-manual-v1";
    inputSha256: string;
  };
  task: {
    id: Observation<string>;
    setId: Observation<string>;
    setVersion: Observation<string>;
    title: Observation<string>;
    prompt: Observation<string>;
  };
  time: {
    startedAt: Observation<string>;
    completedAt: Observation<string>;
    timezone: Observation<string>;
  };
  model: {
    name: Observation<string>;
    id: Observation<string>;
    version: Observation<string>;
    provider: Observation<string>;
    selectionMethod: "manual" | "automatic" | "unknown";
    identified: boolean;
  };
  agent: {
    name: string;
    version: Observation<string>;
    interface: "api" | "cli" | "ide" | "cloud" | "other";
    tools: Observation<string[]>;
    permissions: Observation<string>;
    humanIntervention: Observation<string>;
  };
  environment: {
    os: Observation<string>;
    cpu: Observation<string>;
    gpu: Observation<string>;
    memory: Observation<string>;
    executionMode: string;
    unavailable: string[];
  };
  conditions: {
    id: string;
    settings: Record<string, string | number | boolean | null>;
  };
  execution: {
    status: PublicExecutionStatus;
    taskOutcome: "success" | "failure" | "indeterminate" | "not_applicable";
    scoringStatus: string;
    automaticScore: Observation<number>;
    manualScore: Observation<number>;
    response: Observation<string>;
    durationMs: Observation<number>;
    modelLoadDurationMs: Observation<number>;
    promptEvaluationDurationMs: Observation<number>;
    inputTokens: Observation<number>;
    outputTokens: Observation<number>;
    generationTokensPerSecond: Observation<number>;
    completionReason: Observation<string>;
    cost: Observation<{ amount: number; currency: string }>;
    tests: Array<{
      name: string;
      status: "passed" | "failed" | "not_run" | "not_applicable";
      command: Observation<string>;
      evidence: Observation<string>;
    }>;
    evaluationUnavailable: string[];
    errorCode: Observation<string>;
  };
  evaluation: {
    protocolId: Observation<string>;
    protocolVersion: Observation<string>;
    criteria: PublicEvaluationCriterion[];
  };
  contamination: {
    status: "none_detected" | "present" | "unknown";
    limitations: string[];
  };
  publicReferences: string[];
};

export type PublicBenchmarkDocument = {
  format: typeof PUBLIC_BENCHMARK_FORMAT;
  schemaVersion: 1;
  dataKind: "user_recorded" | "synthetic_sample";
  experiments: PublicBenchmarkExperiment[];
};

export type CliManualRecord = {
  format: typeof CLI_RECORD_FORMAT;
  sampleRecord?: boolean;
  template?: boolean;
  experiment: {
    id: string;
    taskId: string;
    taskSetId: string | null;
    taskSetVersion: string | null;
    taskTitle: string;
    taskPrompt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    timezone: string | null;
    evaluationProtocolId: string | null;
    evaluationProtocolVersion: string | null;
  };
  model: {
    name: string | null;
    id: string | null;
    version: string | null;
    provider: string | null;
    selectionMethod: "manual" | "automatic" | "unknown";
  };
  agent: {
    name: string;
    version: string | null;
    interface: "api" | "cli" | "ide" | "cloud" | "other";
    tools: string[] | null;
    permissions: string | null;
    humanIntervention: string | null;
  };
  environment: {
    os: string | null;
    cpu: string | null;
    gpu: string | null;
    memory: string | null;
    executionMode: string;
    unavailable: string[];
  };
  conditions: Record<string, string | number | boolean | null>;
  execution: {
    status: PublicExecutionStatus;
    taskOutcome: "success" | "failure" | "indeterminate" | "not_applicable";
    scoringStatus: string;
    automaticScore: number | null;
    manualScore: number | null;
    response: string | null;
    durationMs: number | null;
    modelLoadDurationMs: number | null;
    promptEvaluationDurationMs: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    generationTokensPerSecond: number | null;
    completionReason: string | null;
    cost: { amount: number; currency: string } | null;
    tests: Array<{
      name: string;
      status: "passed" | "failed" | "not_run" | "not_applicable";
      command: string | null;
      evidence: string | null;
    }>;
    evaluationUnavailable: string[];
    errorCode: string | null;
  };
  evaluation: {
    criteria: Array<{
      id: string;
      label: string;
      description: string;
      scoringMethod: "automatic" | "manual";
      maxScore: number;
      score: PublicScore;
      evidence: string[];
      unobserved: string[];
      assessorJudgment: string | null;
      evidenceReferences: string[];
    }>;
  };
  contamination: {
    status: "none_detected" | "present" | "unknown";
    limitations: string[];
  };
  publicReferences: string[];
};

export type PublicDisclosureOptions = {
  includeTaskPrompt: boolean;
  includeResponses: boolean;
  includeEvidence: boolean;
  includeJudgments: boolean;
  includeTestCommands: boolean;
};

export type PublicIntegrityManifest = {
  format: "benchmark-public-manifest/v1";
  fileName: string;
  algorithm: "SHA-256";
  sha256: string;
  scope: "exact downloaded UTF-8 JSON file bytes";
  limitation: string;
};
