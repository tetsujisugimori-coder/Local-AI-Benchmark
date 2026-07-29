export type ExecutionTask = {
  modelId: string;
  runNumber: number;
};

export function createExecutionPlan(
  modelIds: readonly string[],
  executionCount: number,
) {
  return modelIds.flatMap((modelId) =>
    Array.from({ length: executionCount }, (_, index) => ({
      modelId,
      runNumber: index + 1,
    })),
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
