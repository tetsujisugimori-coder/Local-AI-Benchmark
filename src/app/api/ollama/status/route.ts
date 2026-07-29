import { BENCHMARK_MODELS } from "@/config/models";
import {
  getOllamaVersion,
  listInstalledModels,
  toBenchmarkError,
} from "@/lib/ollama-client";
import { getRuntimeConfig } from "@/lib/runtime-config";
import type { OllamaSetupStatus } from "@/types/benchmark";

export const dynamic = "force-dynamic";

export async function GET() {
  const { ollamaBaseUrl } = getRuntimeConfig();

  try {
    const [version, installedModels] = await Promise.all([
      getOllamaVersion(),
      listInstalledModels(),
    ]);
    const installedById = new Map(
      installedModels.map((model) => [model.id, model]),
    );

    const status: OllamaSetupStatus = {
      connected: true,
      baseUrl: ollamaBaseUrl,
      version,
      models: BENCHMARK_MODELS.map((definition) => {
        const installed = installedById.get(definition.id);
        return {
          ...definition,
          installed: Boolean(installed),
          available: Boolean(installed),
          size: installed?.size ?? null,
          modifiedAt: installed?.modifiedAt ?? null,
          parameterSize: installed?.parameterSize ?? null,
          quantizationLevel: installed?.quantizationLevel ?? null,
        };
      }),
      error: null,
    };

    return Response.json(status, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const status: OllamaSetupStatus = {
      connected: false,
      baseUrl: ollamaBaseUrl,
      version: null,
      models: BENCHMARK_MODELS.map((definition) => ({
        ...definition,
        installed: false,
        available: false,
        size: null,
        modifiedAt: null,
        parameterSize: null,
        quantizationLevel: null,
      })),
      error: toBenchmarkError(error),
    };

    return Response.json(status, {
      headers: { "Cache-Control": "no-store" },
    });
  }
}
