export type ModelDefinition = {
  id: string;
  displayName: string;
  family: string;
};

export type ModelAvailability = ModelDefinition & {
  installed: boolean;
  available: boolean;
  size: number | null;
  modifiedAt: string | null;
  parameterSize: string | null;
  quantizationLevel: string | null;
};

export type BenchmarkErrorCode =
  | "OLLAMA_NOT_RUNNING"
  | "CONNECTION_FAILED"
  | "MODEL_NOT_INSTALLED"
  | "MODEL_LOAD_FAILED"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "ABORTED"
  | "OLLAMA_ERROR"
  | "INVALID_REQUEST";

export type BenchmarkError = {
  code: BenchmarkErrorCode;
  message: string;
};

export type OllamaSetupStatus = {
  connected: boolean;
  baseUrl: string;
  version: string | null;
  models: ModelAvailability[];
  error: BenchmarkError | null;
};

export type RunMode = "cold" | "warm";
export type BenchmarkMode = "freeform" | "phase2";
export type ExecutionStatus = "completed" | "failed" | "aborted" | "not_run";
export type ScoringStatus =
  | "unscored"
  | "automatic"
  | "manual_required"
  | "partial"
  | "manual_complete";

export type EvaluationDimension =
  | "correctness"
  | "reasoning_verifiability"
  | "instruction_adherence"
  | "self_correction"
  | "ambiguity_handling"
  | "conciseness";

export type AutomaticScoringRule =
  | { type: "max_characters"; maximum: number }
  | {
      type: "strict_json";
      requiredKeys: string[];
      allowAdditionalKeys: boolean;
    }
  | { type: "required_phrases"; phrases: string[] };

export type ProblemEvaluationCriterion = {
  id: string;
  label: string;
  dimension: EvaluationDimension;
  description: string;
  maxScore: number;
  scoringMethod: "automatic" | "manual";
  automaticRule?: AutomaticScoringRule;
};

export type Phase2Problem = {
  id: string;
  title: string;
  prompt: string;
  evaluationCriteria: ProblemEvaluationCriterion[];
  expectedAnswerConditions: string[];
  version: string;
};

export type Phase2ProblemSet = {
  id: string;
  title: string;
  version: string;
  problems: Phase2Problem[];
};

export type CriterionScore = {
  criterionId: string;
  label: string;
  status: "passed" | "failed" | "manual_required" | "not_scored";
  score: number | null;
  maxScore: number;
  note: string;
};

export type BenchmarkSettings = {
  systemPrompt: string;
  temperature: number;
  seed: number;
  maxTokens: number;
  contextLength: number;
  executionCount: number;
  runMode: RunMode;
  stream: boolean;
  think: boolean;
};

export type BenchmarkRunRequest = BenchmarkSettings & {
  modelId: string;
  prompt: string;
  runNumber: number;
  benchmarkMode?: BenchmarkMode;
  problemId?: string | null;
  executionOrder?: number;
};

export type BenchmarkResult = {
  modelId: string;
  displayName: string;
  runNumber: number;
  response: string;
  thinking: string;
  settings: BenchmarkSettings;
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  totalDurationNs: number | null;
  loadDurationNs: number | null;
  promptEvalCount: number | null;
  promptEvalDurationNs: number | null;
  evalCount: number | null;
  evalDurationNs: number | null;
  promptTokensPerSecond: number | null;
  outputTokensPerSecond: number | null;
  doneReason: string | null;
  error: BenchmarkError | null;
  executionOrder?: number;
  executionStatus?: ExecutionStatus;
  scoringStatus?: ScoringStatus;
  automaticScore?: number | null;
  manualScore?: number | null;
  criterionScores?: CriterionScore[];
};

export type BenchmarkDocument = {
  schemaVersion: 1;
  benchmarkMode?: BenchmarkMode;
  benchmarkId: string;
  createdAt: string;
  completedAt?: string;
  environment: {
    ollamaBaseUrl: string;
    appVersion: string;
    platform: string;
    cpu: string;
    memory: string;
  };
  request: {
    prompt: string;
    systemPrompt: string;
    temperature: number;
    seed: number;
    maxTokens: number;
    contextLength: number;
    executionCount: number;
    runMode: RunMode;
    stream: boolean;
    think: boolean;
  };
  results: BenchmarkResult[];
  problemSetId?: string;
  problemSetVersion?: string;
  problemId?: string;
  problemTitle?: string;
  evaluationCriteria?: ProblemEvaluationCriterion[];
  expectedAnswerConditions?: string[];
  answers?: BenchmarkResult[];
};

export type BenchmarkMemoModelExport = {
  modelId: string;
  displayName: string;
  runNumber: number;
  executionOrder: number | null;
  executionStatus: ExecutionStatus;
  response: string;
  thinking: string;
  error: BenchmarkError | null;
  startedAt: string;
  finishedAt: string;
  measurements: {
    elapsedMs: number;
    promptEvalCount: number | null;
    evalCount: number | null;
    outputTokensPerSecond: number | null;
    doneReason: string | null;
  };
  scoring: {
    automaticScore: number | null;
    manualScore: number | null;
    scoringStatus: ScoringStatus;
    criterionScores: CriterionScore[];
  };
};

export type BenchmarkMemoExportItem = {
  title: string;
  summary: string[];
  metadata: {
    benchmarkId: string;
    problemSetId: string | null;
    problemSetVersion: string | null;
    problemId: string;
    problemTitle: string;
    modelCount: number;
    evaluationCriteria: ProblemEvaluationCriterion[];
    expectedAnswerConditions: string[];
    models: BenchmarkMemoModelExport[];
  };
};

export type BenchmarkMemoExportDocument = {
  title: string;
  date: string;
  items: BenchmarkMemoExportItem[];
  trendSummary: string;
};

export type BenchmarkProgress = {
  completed: number;
  total: number;
  currentModel: string | null;
  completedModels: string[];
  failedModels: string[];
};
