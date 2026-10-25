import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createIntegrityManifest,
  validatePublicBenchmarkDocument,
} from "../src/lib/public-benchmark.ts";
import type { PublicBenchmarkDocument } from "../src/types/public-benchmark.ts";
import {
  assessComparability,
  safeExternalHref,
  validateCatalog,
  verifyBenchmarkPair,
} from "../viewer/src/lib/viewer-data.ts";

const sampleBytes = new Uint8Array(
  await readFile(new URL("../examples/sample-public-benchmark.json", import.meta.url)),
);
const sampleText = new TextDecoder("utf-8", { fatal: true }).decode(sampleBytes);
const sampleDocument = JSON.parse(sampleText) as PublicBenchmarkDocument;

async function manifestFor(bytes: Uint8Array, fileName = "sample.json") {
  return new TextEncoder().encode(
    `${JSON.stringify(
      await createIntegrityManifest({
        fileName,
        serializedDocument: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      }),
      null,
      2,
    )}\n`,
  );
}

test("viewer validates public sample and exact manifest bytes", async () => {
  const pair = await verifyBenchmarkPair({
    jsonBytes: sampleBytes,
    manifestBytes: await manifestFor(sampleBytes),
    expectedDataKind: "synthetic_sample",
  });
  assert.equal(pair.document.dataKind, "synthetic_sample");
  assert.equal(pair.manifest.algorithm, "SHA-256");
});

test("viewer rejects unsupported schemas, malformed JSON, bad UTF-8 and oversize files", async () => {
  const badSchema = structuredClone(sampleDocument);
  badSchema.schemaVersion = 2 as 1;
  await assert.rejects(
    verifyBenchmarkPair({
      jsonBytes: new TextEncoder().encode(JSON.stringify(badSchema)),
      manifestBytes: await manifestFor(sampleBytes),
    }),
  );
  await assert.rejects(
    verifyBenchmarkPair({
      jsonBytes: new TextEncoder().encode("{"),
      manifestBytes: await manifestFor(sampleBytes),
    }),
  );
  await assert.rejects(
    verifyBenchmarkPair({
      jsonBytes: new Uint8Array([0xff, 0xfe]),
      manifestBytes: await manifestFor(sampleBytes),
    }),
  );
  await assert.rejects(
    verifyBenchmarkPair({
      jsonBytes: new Uint8Array(2 * 1024 * 1024 + 1),
      manifestBytes: new TextEncoder().encode("{}"),
    }),
  );
});

test("viewer rejects hash mismatch, one-byte changes, and UTF-8 newline differences", async () => {
  const originalManifest = await manifestFor(sampleBytes);
  const changed = new TextEncoder().encode(
    sampleText.replace("Example Model", "example Model"),
  );
  assert.notEqual(changed.length, 0);
  await assert.rejects(
    verifyBenchmarkPair({
      jsonBytes: changed,
      manifestBytes: originalManifest,
    }),
  );
  const newlineChanged = new TextEncoder().encode(`${sampleText}\n`);
  await assert.rejects(
    verifyBenchmarkPair({
      jsonBytes: newlineChanged,
      manifestBytes: originalManifest,
    }),
  );
  await assert.rejects(
    verifyBenchmarkPair({
      jsonBytes: sampleBytes,
      manifestBytes: new TextEncoder().encode("{}"),
    }),
  );
});

test("viewer rejects duplicate experiment identifiers and unknown states", () => {
  const duplicate = structuredClone(sampleDocument);
  duplicate.experiments.push(structuredClone(duplicate.experiments[0]));
  assert.throws(() => validatePublicBenchmarkDocument(duplicate), /重複/);
  const invalid = structuredClone(sampleDocument);
  invalid.experiments[0].execution.status = "unknown" as never;
  assert.throws(() => validatePublicBenchmarkDocument(invalid));
  const invalidNumber = structuredClone(sampleDocument);
  invalidNumber.experiments[0].execution.durationMs = {
    status: "observed",
    value: Number.NaN,
  };
  assert.throws(() => validatePublicBenchmarkDocument(invalidNumber));
});

test("catalog rejects duplicate IDs, unsafe paths and unknown catalog versions", () => {
  assert.throws(() => validateCatalog({ catalogVersion: 2, entries: [] }));
  assert.throws(() =>
    validateCatalog({
      catalogVersion: 1,
      entries: [
        {
          id: "sample-one",
          dataFile: "../private.json",
          manifestFile: "data/sample-one.manifest.json",
          dataKind: "synthetic_sample",
          reviewedAt: "2026-10-26T00:00:00.000Z",
          reviewedBy: "reviewer",
          reviewNote: "Synthetic sample",
        },
      ],
    }),
  );
  const entry = {
    id: "sample-one",
    dataFile: "data/sample-one.json",
    manifestFile: "data/sample-one.manifest.json",
    dataKind: "synthetic_sample",
    reviewedAt: "2026-10-26T00:00:00.000Z",
    reviewedBy: "reviewer",
    reviewNote: "Synthetic sample",
  };
  assert.throws(() =>
    validateCatalog({ catalogVersion: 1, entries: [entry, entry] }),
  );
});

test("comparability flags matching known factors but preserves unknowns and warnings", () => {
  const first = structuredClone(sampleDocument.experiments[0]);
  const second = structuredClone(first);
  second.id = "exp-another-synthetic-trial";
  second.conditions.id = "a".repeat(64);
  const comparable = assessComparability([first, second]);
  assert.equal(comparable.label, "条件差があるため参考比較");
  assert.ok(comparable.unknowns.some((item) => item.includes("未観測")));
  assert.ok(comparable.cautions.some((item) => item.includes("情報汚染状態が不明")));
  assert.equal(comparable.differences.length, 0);

  second.task.setVersion = { status: "observed", value: "2.0.0" };
  const differentTask = assessComparability([first, second]);
  assert.equal(differentTask.label, "直接比較不可");
  assert.ok(differentTask.differences.some((item) => item.includes("課題バージョン")));
});

test("comparability does not conflate zero scores, unobserved, N/A, or non-success states", () => {
  const first = structuredClone(sampleDocument.experiments[0]);
  const second = structuredClone(first);
  second.id = "exp-zero-score";
  first.evaluation.criteria[0].score = 0;
  second.evaluation.criteria[0].score = "not_observed";
  second.execution.status = "not_run";
  second.execution.taskOutcome = "not_applicable";
  const result = assessComparability([first, second]);
  assert.ok(result.cautions.some((item) => item.includes("成功以外")));
  assert.notEqual(first.evaluation.criteria[0].score, second.evaluation.criteria[0].score);
});

test("comparability treats visible setting and rubric changes as differences, not fingerprint equality", () => {
  const first = structuredClone(sampleDocument.experiments[0]);
  const second = structuredClone(first);
  second.id = "exp-changed-public-settings";
  second.conditions.settings.timeLimitMinutes = 45;
  second.evaluation.protocolVersion = {
    status: "observed",
    value: "2.0.0",
  };
  const result = assessComparability([first, second]);
  assert.equal(result.label, "直接比較不可");
  assert.ok(result.differences.some((item) => item.includes("評価規約バージョン")));
  assert.ok(result.differences.some((item) => item.includes("timeLimitMinutes")));
});

test("comparability detects criterion description changes and unknown descriptions", () => {
  const first = structuredClone(sampleDocument.experiments[0]);
  const second = structuredClone(first);
  second.id = "exp-changed-criterion-description";
  first.evaluation.criteria[0].description = {
    status: "observed",
    value: "Reproduce the reported failure.",
  };
  second.evaluation.criteria[0].description = {
    status: "observed",
    value: "Reproduce and document the reported failure.",
  };

  const different = assessComparability([first, second]);
  assert.equal(different.label, "直接比較不可");
  assert.ok(
    different.differences.some((item) =>
      item.includes("評価項目「reproduction」の説明"),
    ),
  );

  second.evaluation.criteria[0].description = {
    status: "not_observed",
    reason: "The criterion description is not public.",
  };
  const unknown = assessComparability([first, second]);
  assert.equal(unknown.label, "条件差があるため参考比較");
  assert.ok(
    unknown.unknowns.some((item) =>
      item.includes("評価項目「reproduction」の説明"),
    ),
  );
});

test("external links allow HTTP(S) only without credentials or local targets", () => {
  assert.equal(
    safeExternalHref("https://www.iana.org/example"),
    "https://www.iana.org/example",
  );
  for (const href of [
    "javascript:alert(1)",
    "https://user:pass@iana.org/",
    "http://localhost./admin",
    "http://192.168.1.1/private",
    "https://iana.org/?access_token=private",
  ]) {
    assert.equal(safeExternalHref(href), null);
  }
});
