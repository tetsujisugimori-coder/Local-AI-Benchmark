import type { ModelDefinition } from "../types/benchmark";

export const BENCHMARK_MODELS = [
  {
    id: "qwen3.5:latest",
    displayName: "Qwen 3.5",
    family: "Qwen",
  },
  {
    id: "granite4.1:8b",
    displayName: "Granite 4.1 8B",
    family: "Granite",
  },
  {
    id: "danielshamaei93/llama3-8b-uncensored:latest",
    displayName: "Llama 3 8B Uncensored",
    family: "Llama",
  },
  {
    id: "phi4-mini:latest",
    displayName: "Phi-4 Mini",
    family: "Phi",
  },
] as const satisfies readonly ModelDefinition[];

export const DEFAULT_SELECTED_MODEL_IDS = BENCHMARK_MODELS.map(
  (model) => model.id,
);
