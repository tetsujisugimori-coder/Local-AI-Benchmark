const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_TIMEOUT_MS = 300_000;

function normalizeBaseUrl(value: string | undefined) {
  const candidate = value?.trim() || DEFAULT_OLLAMA_BASE_URL;
  const url = new URL(candidate);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("OLLAMA_BASE_URLはhttpまたはhttpsで指定してください。");
  }

  if (url.username || url.password) {
    throw new Error("OLLAMA_BASE_URLに認証情報を含めないでください。");
  }

  return url.toString().replace(/\/$/, "");
}

function parseTimeout(value: string | undefined) {
  if (!value) {
    return DEFAULT_TIMEOUT_MS;
  }

  const timeout = Number(value);
  if (!Number.isSafeInteger(timeout) || timeout < 1_000) {
    throw new Error(
      "OLLAMA_REQUEST_TIMEOUT_MSは1000以上の整数で指定してください。",
    );
  }

  return timeout;
}

export function getRuntimeConfig() {
  return {
    ollamaBaseUrl: normalizeBaseUrl(process.env.OLLAMA_BASE_URL),
    requestTimeoutMs: parseTimeout(process.env.OLLAMA_REQUEST_TIMEOUT_MS),
  };
}
