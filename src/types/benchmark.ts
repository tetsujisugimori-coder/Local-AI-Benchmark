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

export type BenchmarkSettings = {
  systemPrompt: string;
  temperature: number;
  seed: number;
  maxTokens: number;
  contextLength: number;
  executionCount: number;
  runMode: RunMode;
  stream: boolean;
};

export type BenchmarkRunRequest = BenchmarkSettings & {
  modelId: string;
  prompt: string;
  runNumber: number;
};

export type BenchmarkResult = {
  modelId: string;
  displayName: string;
  runNumber: number;
  response: string;
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
};

export type BenchmarkDocument = {
  schemaVersion: 1;
  benchmarkId: string;
  createdAt: string;
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
  };
  results: BenchmarkResult[];
};

export type BenchmarkProgress = {
  completed: number;
  total: number;
  currentModel: string | null;
  completedModels: string[];
  failedModels: string[];
};
