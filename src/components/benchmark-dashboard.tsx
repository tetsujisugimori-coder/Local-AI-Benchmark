"use client";

import { useEffect, useRef, useState } from "react";
import { BENCHMARK_MODELS, DEFAULT_SELECTED_MODEL_IDS } from "@/config/models";
import {
  getPhase2Problem,
  PHASE2_PROBLEM_SET,
} from "@/data/phase2-problems";
import { createBenchmarkDocument } from "@/lib/benchmark-document";
import {
  createBenchmarkMemoExport,
  createBenchmarkMemoFilename,
} from "@/lib/memo-nexus";
import {
  createExecutionPlan,
  remainingExecutionTasks,
  runSequentially,
} from "@/lib/sequential-runner";
import type {
  BenchmarkMode,
  BenchmarkError,
  BenchmarkProgress,
  BenchmarkResult,
  BenchmarkSettings,
  ModelAvailability,
  OllamaSetupStatus,
} from "@/types/benchmark";
import { AppHeader } from "@/components/app-header";
import { BenchmarkForm } from "@/components/benchmark-form";
import { ModelSelector } from "@/components/model-selector";
import { ProgressPanel } from "@/components/progress-panel";
import { ProblemSelector } from "@/components/problem-selector";
import { ResultTable } from "@/components/result-table";

const DEFAULT_SETTINGS: BenchmarkSettings = {
  systemPrompt: "",
  temperature: 0,
  seed: 42,
  maxTokens: 512,
  contextLength: 4_096,
  executionCount: 1,
  runMode: "warm",
  stream: false,
  think: false,
};

const INITIAL_MODELS: ModelAvailability[] = BENCHMARK_MODELS.map((model) => ({
  ...model,
  installed: false,
  available: false,
  size: null,
  modifiedAt: null,
  parameterSize: null,
  quantizationLevel: null,
}));

const EMPTY_PROGRESS: BenchmarkProgress = {
  completed: 0,
  total: 0,
  currentModel: null,
  completedModels: [],
  failedModels: [],
};

async function fetchSetupStatus() {
  const response = await fetch("/api/ollama/status", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("接続状態の取得に失敗しました。");
  }
  return (await response.json()) as OllamaSetupStatus;
}

function createUnavailableSetup(error: unknown): OllamaSetupStatus {
  return {
    connected: false,
    baseUrl: "http://localhost:11434",
    version: null,
    models: INITIAL_MODELS,
    error: {
      code: "CONNECTION_FAILED",
      message:
        error instanceof Error
          ? error.message
          : "接続状態の取得に失敗しました。",
    },
  };
}

function createClientError(
  modelId: string,
  runNumber: number,
  settings: BenchmarkSettings,
  startedAt: string,
  error: BenchmarkError,
  executionOrder: number,
): BenchmarkResult {
  const definition = BENCHMARK_MODELS.find((model) => model.id === modelId);
  return {
    modelId,
    displayName: definition?.displayName ?? modelId,
    runNumber,
    response: "",
    thinking: "",
    settings,
    startedAt,
    finishedAt: new Date().toISOString(),
    elapsedMs: Math.max(0, Date.now() - new Date(startedAt).getTime()),
    totalDurationNs: null,
    loadDurationNs: null,
    promptEvalCount: null,
    promptEvalDurationNs: null,
    evalCount: null,
    evalDurationNs: null,
    promptTokensPerSecond: null,
    outputTokensPerSecond: null,
    doneReason: null,
    error,
    executionOrder,
    executionStatus: error.code === "ABORTED" ? "aborted" : "failed",
    scoringStatus: "unscored",
    automaticScore: null,
    manualScore: null,
    criterionScores: [],
  };
}

function createNotRunResult(
  modelId: string,
  runNumber: number,
  settings: BenchmarkSettings,
  executionOrder: number,
): BenchmarkResult {
  const createdAt = new Date().toISOString();
  const result = createClientError(
    modelId,
    runNumber,
    settings,
    createdAt,
    { code: "ABORTED", message: "中止後のため実行されませんでした。" },
    executionOrder,
  );
  return {
    ...result,
    executionStatus: "not_run",
    error: null,
  };
}

export function BenchmarkDashboard({ githubUrl }: { githubUrl: string }) {
  const [setup, setSetup] = useState<OllamaSetupStatus | null>(null);
  const [setupLoading, setSetupLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([
    ...DEFAULT_SELECTED_MODEL_IDS,
  ]);
  const [benchmarkMode, setBenchmarkMode] =
    useState<BenchmarkMode>("freeform");
  const [selectedProblemId, setSelectedProblemId] = useState(
    PHASE2_PROBLEM_SET.problems[0].id,
  );
  const [prompt, setPrompt] = useState("");
  const [settings, setSettings] =
    useState<BenchmarkSettings>(DEFAULT_SETTINGS);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] =
    useState<BenchmarkProgress>(EMPTY_PROGRESS);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [benchmarkCreatedAt, setBenchmarkCreatedAt] = useState("");
  const [benchmarkRequest, setBenchmarkRequest] = useState<{
    prompt: string;
    settings: BenchmarkSettings;
    benchmarkMode: BenchmarkMode;
    problemId: string | null;
  } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const selectedProblem =
    getPhase2Problem(selectedProblemId) ?? PHASE2_PROBLEM_SET.problems[0];
  const activePrompt =
    benchmarkMode === "phase2" ? selectedProblem.prompt : prompt;

  const refreshSetup = async () => {
    setSetupLoading(true);
    try {
      const nextSetup = await fetchSetupStatus();
      setSetup(nextSetup);
      if (nextSetup.connected) {
        setSelectedIds(
          nextSetup.models
            .filter((model) => model.available)
            .map((model) => model.id),
        );
      }
    } catch (error) {
      setSetup(createUnavailableSetup(error));
    } finally {
      setSetupLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    void fetchSetupStatus()
      .then((nextSetup) => {
        if (!active) {
          return;
        }
        setSetup(nextSetup);
        if (nextSetup.connected) {
          setSelectedIds(
            nextSetup.models
              .filter((model) => model.available)
              .map((model) => model.id),
          );
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setSetup(createUnavailableSetup(error));
        }
      })
      .finally(() => {
        if (active) {
          setSetupLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  const toggleModel = (modelId: string) => {
    setSelectedIds((current) =>
      current.includes(modelId)
        ? current.filter((id) => id !== modelId)
        : [...current, modelId],
    );
  };

  const updateNumber = (
    key:
      | "temperature"
      | "seed"
      | "maxTokens"
      | "contextLength"
      | "executionCount",
    value: number,
  ) => {
    if (Number.isNaN(value)) {
      return;
    }
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const runBenchmark = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (!setup?.connected) {
      setFormError("Ollamaへ接続してから実行してください。");
      return;
    }
    if (!activePrompt.trim()) {
      setFormError("共通プロンプトを入力してください。");
      return;
    }
    if (selectedIds.length === 0) {
      setFormError("利用可能なモデルを1つ以上選択してください。");
      return;
    }

    const availableIds = new Set(
      setup.models.filter((model) => model.available).map((model) => model.id),
    );
    const runModelIds = BENCHMARK_MODELS.map((model) => model.id).filter(
      (modelId) => selectedIds.includes(modelId) && availableIds.has(modelId),
    );
    if (runModelIds.length === 0) {
      setFormError("選択したモデルが現在利用できません。");
      return;
    }

    const tasks = createExecutionPlan(runModelIds, settings.executionCount);
    const total = tasks.length;
    const createdAt = new Date().toISOString();
    const controller = new AbortController();
    controllerRef.current = controller;
    setBenchmarkCreatedAt(createdAt);
    setBenchmarkRequest({
      prompt: activePrompt,
      settings: { ...settings },
      benchmarkMode,
      problemId: benchmarkMode === "phase2" ? selectedProblem.id : null,
    });
    setResults([]);
    setProgress({ ...EMPTY_PROGRESS, total });
    setRunning(true);

    const completedModels: string[] = [];
    const failedModels: string[] = [];

    const completedResults = await runSequentially(
      tasks,
      async ({ modelId, runNumber }) => {
        const executionOrder =
          tasks.findIndex(
            (task) =>
              task.modelId === modelId && task.runNumber === runNumber,
          ) + 1;
        const model = BENCHMARK_MODELS.find((item) => item.id === modelId);
        const runLabel = `${model?.displayName ?? modelId} / Run ${runNumber}`;
        setProgress((current) => ({ ...current, currentModel: runLabel }));
        const startedAt = new Date().toISOString();

        try {
          const response = await fetch("/api/benchmark/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              ...settings,
              prompt: activePrompt,
              modelId,
              runNumber,
              benchmarkMode,
              problemId:
                benchmarkMode === "phase2" ? selectedProblem.id : null,
              executionOrder,
            }),
          });

          if (!response.ok) {
            const body = (await response.json()) as {
              error?: BenchmarkError;
            };
            throw body.error ?? {
              code: "INVALID_RESPONSE",
              message: "ベンチマークAPIから不正な応答が返されました。",
            };
          }

          return (await response.json()) as BenchmarkResult;
        } catch (error) {
          const benchmarkError: BenchmarkError =
            controller.signal.aborted
              ? { code: "ABORTED", message: "ユーザーが実行を中止しました。" }
              : typeof error === "object" &&
                  error !== null &&
                  "code" in error &&
                  "message" in error
                ? (error as BenchmarkError)
                : {
                    code: "CONNECTION_FAILED",
                    message:
                      error instanceof Error
                        ? error.message
                        : "ベンチマークAPIとの通信に失敗しました。",
                  };
          return createClientError(
            modelId,
            runNumber,
            settings,
            startedAt,
            benchmarkError,
            executionOrder,
          );
        }
      },
      {
        shouldStop: () => controller.signal.aborted,
        onResult: (result, task, completed) => {
          const model = BENCHMARK_MODELS.find(
            (item) => item.id === task.modelId,
          );
          const runLabel = `${model?.displayName ?? task.modelId} / Run ${
            task.runNumber
          }`;
          setResults((current) => [...current, result]);
        if (result.error) {
          failedModels.push(runLabel);
        } else {
          completedModels.push(runLabel);
        }
        setProgress({
          completed,
          total,
          currentModel: controller.signal.aborted ? "中止しました" : runLabel,
          completedModels: [...completedModels],
          failedModels: [...failedModels],
        });
        },
      },
    );

    const notRunResults = controller.signal.aborted
      ? remainingExecutionTasks(tasks, completedResults.length).map(
          (task, index) =>
            createNotRunResult(
              task.modelId,
              task.runNumber,
              settings,
              completedResults.length + index + 1,
            ),
        )
      : [];
    if (notRunResults.length > 0) {
      setResults([...completedResults, ...notRunResults]);
    }

    setProgress((current) => ({
      ...current,
      currentModel: controller.signal.aborted
        ? "ユーザーが中止しました"
        : "すべての実行が完了しました",
    }));
    controllerRef.current = null;
    setRunning(false);
  };

  const cancelBenchmark = () => {
    controllerRef.current?.abort();
  };

  const downloadResults = () => {
    if (
      !setup ||
      results.length === 0 ||
      !benchmarkCreatedAt ||
      !benchmarkRequest
    ) {
      return;
    }

    const document = createBenchmarkDocument({
      createdAt: benchmarkCreatedAt,
      ollamaBaseUrl: setup.baseUrl,
      prompt: benchmarkRequest.prompt,
      settings: benchmarkRequest.settings,
      results,
      benchmarkMode: benchmarkRequest.benchmarkMode,
      problem:
        benchmarkRequest.benchmarkMode === "phase2" &&
        benchmarkRequest.problemId
          ? getPhase2Problem(benchmarkRequest.problemId)
          : null,
      completedAt: new Date().toISOString(),
    });
    const blob = new Blob([JSON.stringify(document, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `${document.benchmarkId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadMemoNexus = () => {
    if (
      !setup ||
      results.length === 0 ||
      !benchmarkCreatedAt ||
      !benchmarkRequest ||
      benchmarkRequest.benchmarkMode !== "phase2" ||
      !benchmarkRequest.problemId
    ) {
      return;
    }
    const problem = getPhase2Problem(benchmarkRequest.problemId);
    if (!problem) {
      return;
    }
    const document = createBenchmarkDocument({
      createdAt: benchmarkCreatedAt,
      ollamaBaseUrl: setup.baseUrl,
      prompt: benchmarkRequest.prompt,
      settings: benchmarkRequest.settings,
      results,
      benchmarkMode: "phase2",
      problem,
      completedAt: new Date().toISOString(),
    });
    const memoDocument = createBenchmarkMemoExport(document);
    const blob = new Blob([JSON.stringify(memoDocument, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = createBenchmarkMemoFilename(document);
    link.click();
    URL.revokeObjectURL(url);
  };

  const updateManualScore = (index: number, score: number | null) => {
    setResults((current) =>
      current.map((result, resultIndex) =>
        resultIndex === index
          ? {
              ...result,
              manualScore: score,
              scoringStatus:
                score === null
                  ? result.automaticScore === null
                    ? "manual_required"
                    : "partial"
                  : "manual_complete",
            }
          : result,
      ),
    );
  };

  const openSettings = () => {
    settingsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    settingsRef.current?.focus({ preventScroll: true });
  };

  const models = setup?.models ?? INITIAL_MODELS;
  const controlsDisabled = running || setupLoading;
  const benchmarkDisabled =
    controlsDisabled || !setup?.connected || selectedIds.length === 0;

  return (
    <main className="appShell">
      <AppHeader
        status={setup}
        loading={setupLoading}
        githubUrl={githubUrl}
        onOpenSettings={openSettings}
      />

      {!setupLoading && setup?.error ? (
        <div className="connectionAlert" role="alert">
          <strong>Ollamaへ接続できません</strong>
          <p>{setup.error.message}</p>
          <p>
            Ollamaをインストール・起動し、接続先とファイアウォール設定を確認してください。
          </p>
        </div>
      ) : null}

      {setup?.connected &&
      setup.models.some((model) => !model.installed) ? (
        <div className="warningAlert" role="status">
          指定された4モデルのうち、未インストールのモデルがあります。利用可能なモデルだけで実行できます。
        </div>
      ) : null}

      <ProblemSelector
        mode={benchmarkMode}
        problem={selectedProblem}
        disabled={running}
        onModeChange={setBenchmarkMode}
        onProblemChange={setSelectedProblemId}
      />

      <ModelSelector
        models={models}
        selectedIds={selectedIds}
        disabled={controlsDisabled}
        onToggle={toggleModel}
        onRefresh={refreshSetup}
      />

      <BenchmarkForm
        prompt={activePrompt}
        settings={settings}
        disabled={running}
        submitDisabled={benchmarkDisabled}
        settingsRef={settingsRef}
        onPromptChange={setPrompt}
        onSettingsChange={setSettings}
        onNumberChange={updateNumber}
        onSubmit={runBenchmark}
        promptReadOnly={benchmarkMode === "phase2"}
        promptTitle={
          benchmarkMode === "phase2" ? "選択した問題文" : "共通プロンプト"
        }
      />

      {formError ? (
        <p className="formError" role="alert">
          {formError}
        </p>
      ) : null}

      <ProgressPanel
        progress={progress}
        running={running}
        onCancel={cancelBenchmark}
      />
      <ResultTable
        results={results}
        benchmarkMode={benchmarkRequest?.benchmarkMode ?? benchmarkMode}
        onDownload={downloadResults}
        onDownloadMemoNexus={downloadMemoNexus}
        onManualScoreChange={updateManualScore}
      />

      <footer>
        <p>
          プロンプトと測定結果は、このアプリから外部AIサービスへ送信されません。
          通信先は設定されたOllama APIだけです。
        </p>
        <p>ライセンス未設定 · Local-only Phase 2</p>
      </footer>
    </main>
  );
}
