const NANOSECONDS_PER_SECOND = 1_000_000_000;
const NANOSECONDS_PER_MILLISECOND = 1_000_000;

export function nanosecondsToSeconds(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return value / NANOSECONDS_PER_SECOND;
}

export function nanosecondsToMilliseconds(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return value / NANOSECONDS_PER_MILLISECOND;
}

export function calculateTokensPerSecond(
  tokenCount: number | null | undefined,
  durationNs: number | null | undefined,
) {
  if (
    tokenCount === null ||
    tokenCount === undefined ||
    durationNs === null ||
    durationNs === undefined ||
    tokenCount < 0 ||
    durationNs <= 0 ||
    !Number.isFinite(tokenCount) ||
    !Number.isFinite(durationNs)
  ) {
    return null;
  }

  return tokenCount / (durationNs / NANOSECONDS_PER_SECOND);
}

export function formatDurationNs(value: number | null) {
  if (value === null) {
    return "—";
  }

  if (value < NANOSECONDS_PER_SECOND) {
    const milliseconds = nanosecondsToMilliseconds(value);
    return `${milliseconds?.toFixed(1)} ms`;
  }

  const seconds = nanosecondsToSeconds(value);
  return `${seconds?.toFixed(2)} 秒`;
}

export function formatElapsedMs(value: number) {
  return value < 1_000
    ? `${value.toFixed(0)} ms`
    : `${(value / 1_000).toFixed(2)} 秒`;
}

export function formatTokensPerSecond(value: number | null) {
  return value === null ? "—" : `${value.toFixed(2)} tokens/sec`;
}

export function formatBytes(value: number | null) {
  if (value === null) {
    return "—";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1_024 && unitIndex < units.length - 1) {
    size /= 1_024;
    unitIndex += 1;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
