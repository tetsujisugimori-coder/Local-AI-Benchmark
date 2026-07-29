import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("開発サーバーを3100ポートで起動する", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as { scripts?: Record<string, string> };
  assert.equal(packageJson.scripts?.dev, "next dev -p 3100");
});
