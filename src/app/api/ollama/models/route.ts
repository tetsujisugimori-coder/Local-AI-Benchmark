import { listInstalledModels, toBenchmarkError } from "@/lib/ollama-client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(
      { models: await listInstalledModels(), error: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { models: [], error: toBenchmarkError(error) },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
