export type ExecutionTask = {
  modelId: string;
  runNumber: number;
};

export function createExecutionPlan(
  modelIds: readonly string[],
  executionCount: number,
) {
  return Array.from({ length: executionCount }, (_, index) =>
    modelIds.map((modelId) => ({
      modelId,
      runNumber: index + 1,
    })),
  ).flat();
}

export function remainingExecutionTasks(
  tasks: readonly ExecutionTask[],
  completedCount: number,
) {
  return tasks.slice(
    Math.max(0, Math.min(completedCount, tasks.length)),
  );
}

export async function runSequentially<TResult>(
  tasks: readonly ExecutionTask[],
  execute: (task: ExecutionTask) => Promise<TResult>,
  options: {
    shouldStop: () => boolean;
    onResult: (
      result: TResult,
      task: ExecutionTask,
      completed: number,
    ) => void | Promise<void>;
  },
) {
  const results: TResult[] = [];

  for (const task of tasks) {
    if (options.shouldStop()) {
      break;
    }

    const result = await execute(task);
    results.push(result);
    await options.onResult(result, task, results.length);
  }

  return results;
}
