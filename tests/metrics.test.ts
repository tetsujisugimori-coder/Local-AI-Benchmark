import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateTokensPerSecond,
  formatBytes,
  formatDurationNs,
  nanosecondsToMilliseconds,
  nanosecondsToSeconds,
} from "../src/lib/metrics.ts";

test("Ollamaのナノ秒値を秒とミリ秒へ変換する", () => {
  assert.equal(nanosecondsToSeconds(2_500_000_000), 2.5);
  assert.equal(nanosecondsToMilliseconds(12_500_000), 12.5);
  assert.equal(formatDurationNs(500_000_000), "500.0 ms");
  assert.equal(formatDurationNs(2_500_000_000), "2.50 秒");
});

test("トークン数と評価時間からtokens/secを計算する", () => {
  assert.equal(calculateTokensPerSecond(50, 2_000_000_000), 25);
  assert.equal(calculateTokensPerSecond(0, 2_000_000_000), 0);
  assert.equal(calculateTokensPerSecond(10, 0), null);
  assert.equal(calculateTokensPerSecond(null, 1_000_000_000), null);
});

test("モデルサイズを読みやすい単位へ変換する", () => {
  assert.equal(formatBytes(1_073_741_824), "1.0 GB");
  assert.equal(formatBytes(null), "—");
});
