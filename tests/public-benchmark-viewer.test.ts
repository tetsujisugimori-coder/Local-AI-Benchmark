import assert from "node:assert/strict";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import {
  FRAMEWORK_OUTPUT_FILES,
  OPTIONAL_FRAMEWORK_OUTPUT_FILES,
  validatePublicViewerFiles,
} from "../scripts/public-viewer-validation.mjs";
import { registerPublicBenchmark } from "../scripts/public-benchmark-registration.ts";
import {
  createIntegrityManifest,
  validatePublicBenchmarkDocument,
} from "../src/lib/public-benchmark.ts";
import type {
  PublicBenchmarkDocument,
  PublicBenchmarkExperiment,
} from "../src/types/public-benchmark.ts";
import {
  assessComparability,
  buildMetricGroups,
  safeExternalHref,
  validateCatalog,
  verifyBenchmarkPair,
  type BenchmarkSource,
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

  test("public viewer allowlist accepts only empty Next build-ID directories", async (t) => {
    const fixture = await createViewerValidationFixture(t);
    await validatePublicViewerFiles(fixture.paths);
    const unexpected = path.join(fixture.outputDir, "_next", "0123456789abcdefghij", "private.txt");
    await writeFile(unexpected, "unregistered");
    await assert.rejects(validatePublicViewerFiles(fixture.paths), /Unexpected file/);
  });

  test("public viewer allows only known platform-specific Next route artifacts", async (t) => {
    const fixture = await createViewerValidationFixture(t);
    const routeArtifact = OPTIONAL_FRAMEWORK_OUTPUT_FILES[0];
    const artifactPath = path.join(fixture.outputDir, ...routeArtifact.split("/"));
    await mkdir(path.dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, "generated route artifact");
    await validatePublicViewerFiles(fixture.paths);

    await writeFile(path.join(path.dirname(artifactPath), "private.txt"), "unexpected");
    await assert.rejects(validatePublicViewerFiles(fixture.paths), /Unexpected file/);
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

test("public viewer allowlist rejects unregistered text, CSV, JSON and output files", async (t) => {
  const fixture = await createViewerValidationFixture(t);
  for (const [directory, fileName] of [
    [fixture.publicDir, "private.txt"],
    [path.join(fixture.publicDir, "data"), "extra.csv"],
    [path.join(fixture.publicDir, "catalog"), "unexpected.json"],
    [fixture.outputDir, "private.txt"],
    [path.join(fixture.outputDir, "data"), "extra.csv"],
    [path.join(fixture.outputDir, "catalog"), "unexpected.json"],
  ]) {
    const filePath = path.join(directory, fileName);
    await writeFile(filePath, "unregistered");
    await assert.rejects(
      validatePublicViewerFiles(fixture.paths),
      /Unexpected file/,
      `${filePath} must not be allowlisted`,
    );
    await rm(filePath);
  }
  await validatePublicViewerFiles(fixture.paths);
});

test("public viewer allowlist rejects nested files, symlinks and changed exported bytes", async (t) => {
  const fixture = await createViewerValidationFixture(t);
  const nestedDirectory = path.join(fixture.publicDir, "data", "nested");
  await mkdir(nestedDirectory);
  await writeFile(path.join(nestedDirectory, "extra.txt"), "private");
  await assert.rejects(
    validatePublicViewerFiles(fixture.paths),
    /Unexpected file|Unexpected directory/,
  );
  await rm(nestedDirectory, { recursive: true });

  const outsideFile = path.join(fixture.root, "outside.txt");
  await writeFile(outsideFile, "outside");
  const linkPath = path.join(fixture.publicDir, "linked.txt");
  try {
    await symlink(outsideFile, linkPath);
    await assert.rejects(
      validatePublicViewerFiles(fixture.paths),
      /Symlink is forbidden/,
    );
    await rm(linkPath);
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? error.code
        : undefined;
    if (!["EPERM", "ENOTSUP", "EACCES"].includes(String(code))) throw error;
    t.diagnostic("Symlink creation is unavailable on this Windows host; CI exercises the symlink rejection case.");
  }

  await writeFile(
    path.join(fixture.outputDir, "data", "fixture-one.json"),
    "tampered",
  );
  await assert.rejects(
    validatePublicViewerFiles(fixture.paths),
    /differs from public source/,
  );
  assert.equal(
    (
      await lstat(
        path.join(fixture.outputDir, "data", "fixture-one.json"),
      )
    ).isFile(),
    true,
  );
});

test("registration stores the captured validated bytes even if input paths change", async (t) => {
  const fixture = await createRegistrationFixture(t);
  const candidate = await makeRegistrationInput(fixture.root, "exp-captured-bytes");
  const capturedJson = new Uint8Array(await readFile(candidate.jsonPath));
  const capturedManifest = new Uint8Array(await readFile(candidate.manifestPath));
  let changedAfterVerification = false;
  const dataKind = await registerPublicBenchmark({
    ...fixture.registration,
    ...candidate,
    id: "race-test",
    jsonBytes: capturedJson,
    manifestBytes: capturedManifest,
    reviewedBy: "reviewer",
    reviewNote: "Reviewed synthetic test data",
    io: {
      open: async (filePath, flags) => {
        if (
          !changedAfterVerification &&
          path.basename(String(filePath)) === "race-test.json"
        ) {
          changedAfterVerification = true;
          await writeFile(candidate.jsonPath, "{ changed after verification");
          await writeFile(candidate.manifestPath, "{}");
        }
        return open(filePath, flags);
      },
    },
  });
  assert.equal(changedAfterVerification, true);
  assert.equal(dataKind, "user_recorded");
  const storedJson = new Uint8Array(
    await readFile(path.join(fixture.registration.publicDir, "data", "race-test.json")),
  );
  const storedManifest = new Uint8Array(
    await readFile(
      path.join(fixture.registration.publicDir, "data", "race-test.manifest.json"),
    ),
  );
  assert.deepEqual(storedJson, capturedJson);
  assert.deepEqual(storedManifest, capturedManifest);
  await verifyBenchmarkPair({
    jsonBytes: storedJson,
    manifestBytes: storedManifest,
    expectedDataKind: "user_recorded",
  });
});

test("registration rejects duplicates and preserves existing files on exclusive-copy failure", async (t) => {
  const fixture = await createRegistrationFixture(t);
  const duplicate = await makeRegistrationInput(
    fixture.root,
    sampleDocument.experiments[0].id,
  );
  await assert.rejects(
    registerPublicBenchmark({
      ...fixture.registration,
      ...duplicate,
      jsonBytes: new Uint8Array(await readFile(duplicate.jsonPath)),
      manifestBytes: new Uint8Array(await readFile(duplicate.manifestPath)),
      reviewedBy: "reviewer",
      reviewNote: "Reviewed synthetic test data",
    }),
    /already exists/,
  );

  const candidate = await makeRegistrationInput(fixture.root, "exp-copy-collision");
  const jsonTarget = path.join(fixture.registration.publicDir, "data", "copy-test.json");
  const original = Buffer.from("existing protected content");
  await writeFile(jsonTarget, original);
  const catalogBefore = await readFile(fixture.registration.catalogPath);
  await assert.rejects(
    registerPublicBenchmark({
      ...fixture.registration,
      ...candidate,
      id: "copy-test",
      jsonBytes: new Uint8Array(await readFile(candidate.jsonPath)),
      manifestBytes: new Uint8Array(await readFile(candidate.manifestPath)),
      reviewedBy: "reviewer",
      reviewNote: "Reviewed synthetic test data",
    }),
  );
  assert.deepEqual(await readFile(jsonTarget), original);
  await assert.rejects(
    lstat(path.join(fixture.registration.publicDir, "data", "copy-test.manifest.json")),
  );
  assert.deepEqual(await readFile(fixture.registration.catalogPath), catalogBefore);
});

test("registration rejects a corrupt existing catalog without writing data", async (t) => {
  const fixture = await createRegistrationFixture(t);
  const candidate = await makeRegistrationInput(fixture.root, "exp-corrupt-catalog");
  await writeFile(fixture.registration.catalogPath, "{corrupt");
  const catalogBefore = await readFile(fixture.registration.catalogPath);
  await assert.rejects(
    registerPublicBenchmark({
      ...fixture.registration,
      ...candidate,
      id: "corrupt-case",
      jsonBytes: new Uint8Array(await readFile(candidate.jsonPath)),
      manifestBytes: new Uint8Array(await readFile(candidate.manifestPath)),
      reviewedBy: "reviewer",
      reviewNote: "Reviewed synthetic test data",
    }),
    /invalid JSON/,
  );
  assert.deepEqual(await readFile(fixture.registration.catalogPath), catalogBefore);
  await assert.rejects(
    lstat(path.join(fixture.registration.publicDir, "data", "corrupt-case.json")),
  );
});

test("registration refuses an existing catalog lock without modifying catalog data", async (t) => {
  const fixture = await createRegistrationFixture(t);
  const candidate = await makeRegistrationInput(fixture.root, "exp-locked-registration");
  const lockPath = `${fixture.registration.catalogPath}.lock`;
  const catalogBefore = await readFile(fixture.registration.catalogPath);
  await writeFile(lockPath, "active registration");
  await assert.rejects(
    registerPublicBenchmark({
      ...fixture.registration,
      ...candidate,
      id: "locked-registration",
      jsonBytes: new Uint8Array(await readFile(candidate.jsonPath)),
      manifestBytes: new Uint8Array(await readFile(candidate.manifestPath)),
      reviewedBy: "reviewer",
      reviewNote: "Reviewed synthetic test data",
    }),
  );
  assert.deepEqual(await readFile(fixture.registration.catalogPath), catalogBefore);
  await assert.rejects(
    lstat(
      path.join(
        fixture.registration.publicDir,
        "data",
        "locked-registration.json",
      ),
    ),
  );
});

test("registration rolls back new files and preserves catalog when catalog replacement fails", async (t) => {
  const fixture = await createRegistrationFixture(t);
  const candidate = await makeRegistrationInput(fixture.root, "exp-rollback-case");
  const catalogBefore = await readFile(fixture.registration.catalogPath);
  await assert.rejects(
    registerPublicBenchmark({
      ...fixture.registration,
      ...candidate,
      id: "rollback-case",
      jsonBytes: new Uint8Array(await readFile(candidate.jsonPath)),
      manifestBytes: new Uint8Array(await readFile(candidate.manifestPath)),
      reviewedBy: "reviewer",
      reviewNote: "Reviewed synthetic test data",
      io: {
        rename: async () => {
          throw new Error("simulated catalog update failure");
        },
      },
    }),
    /simulated catalog update failure/,
  );
  for (const file of [
    "rollback-case.json",
    "rollback-case.manifest.json",
  ]) {
    await assert.rejects(
      lstat(path.join(fixture.registration.publicDir, "data", file)),
    );
  }
  assert.deepEqual(await readFile(fixture.registration.catalogPath), catalogBefore);
});

test("registration does not overwrite a catalog changed after it was read", async (t) => {
  const fixture = await createRegistrationFixture(t);
  const candidate = await makeRegistrationInput(fixture.root, "exp-concurrent-catalog");
  const catalogPath = fixture.registration.catalogPath;
  const originalReadFile = readFile;
  let catalogReads = 0;
  let concurrentCatalogBytes: Buffer | null = null;
  await assert.rejects(
    registerPublicBenchmark({
      ...fixture.registration,
      ...candidate,
      id: "stale-catalog",
      jsonBytes: new Uint8Array(await readFile(candidate.jsonPath)),
      manifestBytes: new Uint8Array(await readFile(candidate.manifestPath)),
      reviewedBy: "reviewer",
      reviewNote: "Reviewed synthetic test data",
      io: {
        readFile: async (filePath) => {
          if (path.resolve(String(filePath)) === catalogPath) {
            catalogReads += 1;
            if (catalogReads === 2) {
              const current = await originalReadFile(catalogPath);
              concurrentCatalogBytes = Buffer.concat([current, Buffer.from("\n")]);
              await writeFile(catalogPath, concurrentCatalogBytes);
            }
          }
          return originalReadFile(filePath);
        },
      },
    }),
    /catalog changed during registration/,
  );
  assert.ok(concurrentCatalogBytes);
  assert.deepEqual(await readFile(catalogPath), concurrentCatalogBytes);
  for (const file of ["stale-catalog.json", "stale-catalog.manifest.json"]) {
    await assert.rejects(
      lstat(path.join(fixture.registration.publicDir, "data", file)),
    );
  }
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

test("comparability detects prompt, tool, permission and intervention differences", () => {
  const first = structuredClone(sampleDocument.experiments[0]);
  const second = structuredClone(first);
  second.id = "exp-different-preconditions";
  first.task.prompt = { status: "observed", value: "Fix the provided defect." };
  second.task.prompt = { status: "observed", value: "Review the provided defect." };
  first.agent.tools = { status: "observed", value: ["editor", "test runner"] };
  second.agent.tools = {
    status: "observed",
    value: ["editor", "network", "test runner"],
  };
  first.agent.permissions = { status: "observed", value: "workspace only" };
  second.agent.permissions = { status: "observed", value: "full access" };
  first.agent.humanIntervention = {
    status: "observed",
    value: "initial instruction only",
  };
  second.agent.humanIntervention = {
    status: "observed",
    value: "interactive clarification allowed",
  };

  const result = assessComparability([first, second]);
  assert.equal(result.label, "直接比較不可");
  for (const label of [
    "課題本文",
    "利用可能ツール",
    "エージェント権限",
    "人間の介入条件",
  ]) {
    assert.ok(result.differences.some((item) => item.includes(label)), label);
  }
});

test("comparability treats agent interface changes as a condition difference", () => {
  const first = structuredClone(sampleDocument.experiments[0]);
  const second = structuredClone(first);
  second.id = "exp-different-agent-interface";
  first.agent.interface = "cli";
  second.agent.interface = "ide";

  const result = assessComparability([first, second]);

  assert.ok(
    result.differences.some((item) => item.includes("実行インターフェース")),
  );
  assert.equal(result.label, "直接比較不可");
});

test("comparability treats undisclosed prompt and execution conditions as unknown", () => {
  const first = structuredClone(sampleDocument.experiments[0]);
  const second = structuredClone(first);
  second.id = "exp-undisclosed-preconditions";
  for (const experiment of [first, second]) {
    experiment.task.prompt = {
      status: "observed",
      value: "Same shared task.",
    };
    experiment.agent.tools = {
      status: "observed",
      value: ["editor", "test runner"],
    };
    experiment.agent.permissions = {
      status: "observed",
      value: "workspace only",
    };
    experiment.agent.humanIntervention = {
      status: "observed",
      value: "initial instruction only",
    };
  }
  second.task.prompt = {
    status: "not_observed",
    reason: "Prompt is withheld.",
  };
  second.agent.tools = {
    status: "not_observed",
    reason: "Tool list is withheld.",
  };
  second.agent.permissions = {
    status: "not_applicable",
    reason: "No permission disclosure.",
  };
  second.agent.humanIntervention = {
    status: "not_observed",
    reason: "Intervention record is withheld.",
  };
  const result = assessComparability([first, second]);
  assert.equal(result.label, "条件差があるため参考比較");
  for (const label of [
    "課題本文",
    "利用可能ツール",
    "エージェント権限",
    "人間の介入条件",
  ]) {
    assert.ok(result.unknowns.some((item) => item.includes(label)), label);
  }
});

test("comparability ignores tool ordering and agent/model identity labels", () => {
  const first = structuredClone(sampleDocument.experiments[0]);
  const second = structuredClone(first);
  second.id = "exp-reordered-tools";
  first.agent.tools = { status: "observed", value: ["alpha", "工具", "beta"] };
  second.agent.tools = { status: "observed", value: ["beta", "alpha", "工具"] };
  second.agent.name = "A differently named agent";
  second.model.name = { status: "observed", value: "A different model" };
  second.conditions.id = "f".repeat(64);
  const result = assessComparability([first, second]);
  assert.ok(!result.differences.some((item) => item.includes("利用可能ツール")));
  assert.ok(!result.differences.some((item) => item.includes("エージェント")));
  assert.ok(!result.differences.some((item) => item.includes("モデル")));
});

test("metric groups isolate synthetic values and omit unobserved measurements", () => {
  const synthetic = structuredClone(sampleDocument.experiments[0]);
  synthetic.execution.durationMs = { status: "observed", value: 4200 };
  synthetic.evaluation.criteria[0].score = 3;
  const syntheticRecord = benchmarkSource(synthetic, "synthetic_sample");
  const onlySynthetic = buildMetricGroups([syntheticRecord]);
  assert.equal(onlySynthetic.length, 1);
  assert.equal(onlySynthetic[0].dataKind, "synthetic_sample");
  assert.equal(onlySynthetic[0].points[0].durationMs, 4200);
  assert.equal(onlySynthetic[0].points[0].criteria[0].score, 3);

  const recorded = structuredClone(synthetic);
  recorded.id = "exp-user-recorded-metrics";
  recorded.execution.durationMs = {
    status: "not_observed",
    reason: "Duration withheld.",
  };
  recorded.evaluation.criteria[0].score = "not_observed";
  const recordedRecord = benchmarkSource(recorded, "user_recorded");
  const onlyRecorded = buildMetricGroups([recordedRecord]);
  assert.equal(onlyRecorded.length, 1);
  assert.equal(onlyRecorded[0].dataKind, "user_recorded");
  assert.equal(onlyRecorded[0].points[0].durationMs, null);
  assert.equal(onlyRecorded[0].points[0].criteria[0].score, null);
  assert.equal(
    onlyRecorded[0].points[0].criteria[0].scoreStatus,
    "not_observed",
  );

  const mixed = buildMetricGroups([syntheticRecord, recordedRecord]);
  assert.deepEqual(
    mixed.map((group) => group.dataKind),
    ["user_recorded", "synthetic_sample"],
  );
  assert.equal(
    mixed.find((group) => group.dataKind === "user_recorded")?.points[0]
      .durationMs,
    null,
  );
  assert.equal(
    mixed.find((group) => group.dataKind === "synthetic_sample")?.points[0]
      .durationMs,
    4200,
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

async function createViewerValidationFixture(t: TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), "public-viewer-validation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const publicDir = path.join(root, "public");
  const outputDir = path.join(root, "out");
  const generatedStaticDir = path.join(root, ".next", "static");
  await Promise.all([
    mkdir(path.join(publicDir, "catalog"), { recursive: true }),
    mkdir(path.join(publicDir, "data"), { recursive: true }),
    mkdir(outputDir, { recursive: true }),
    mkdir(path.join(generatedStaticDir, "chunks"), { recursive: true }),
  ]);
  const document = structuredClone(sampleDocument);
  document.experiments[0].id = "exp-allowlist-fixture";
  const jsonText = `${JSON.stringify(document, null, 2)}\n`;
  const jsonBytes = new TextEncoder().encode(jsonText);
  const manifestBytes = await manifestFor(
    jsonBytes,
    "allowlist-fixture.json",
  );
  const catalog = {
    catalogVersion: 1,
    entries: [
      {
        id: "fixture-one",
        dataFile: "data/fixture-one.json",
        manifestFile: "data/fixture-one.manifest.json",
        dataKind: "synthetic_sample",
        reviewedAt: "2026-10-26T00:00:00.000Z",
        reviewedBy: "reviewer",
        reviewNote: "Synthetic fixture",
      },
    ],
  };
  const publicFiles = {
    "catalog/v1.json": `${JSON.stringify(catalog, null, 2)}\n`,
    "data/fixture-one.json": jsonBytes,
    "data/fixture-one.manifest.json": manifestBytes,
  };
  for (const [relative, content] of Object.entries(publicFiles)) {
    const publicPath = path.join(publicDir, ...relative.split("/"));
    await mkdir(path.dirname(publicPath), { recursive: true });
    await writeFile(publicPath, content);
    const outputPath = path.join(outputDir, ...relative.split("/"));
    await mkdir(path.dirname(outputPath), { recursive: true });
    await copyFile(publicPath, outputPath);
  }
  await Promise.all(
    FRAMEWORK_OUTPUT_FILES.map(async (relative) => {
      const outputPath = path.join(outputDir, ...relative.split("/"));
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, "generated framework fixture");
    }),
  );
  const assetPath = path.join(generatedStaticDir, "chunks", "viewer.js");
  await writeFile(assetPath, "generated viewer asset");
  const outputAsset = path.join(outputDir, "_next", "static", "chunks", "viewer.js");
  await mkdir(path.dirname(outputAsset), { recursive: true });
  await copyFile(assetPath, outputAsset);
  const buildId = "0123456789abcdefghij";
  const buildManifest = path.join(generatedStaticDir, buildId, "_buildManifest.js");
  await mkdir(path.dirname(buildManifest), { recursive: true });
  await writeFile(buildManifest, "generated build manifest");
  const outputBuildManifest = path.join(
    outputDir,
    "_next",
    "static",
    buildId,
    "_buildManifest.js",
  );
  await mkdir(path.dirname(outputBuildManifest), { recursive: true });
  await copyFile(buildManifest, outputBuildManifest);
  await mkdir(path.join(outputDir, "_next", buildId), { recursive: true });
  return {
    root,
    publicDir,
    outputDir,
    paths: { publicDir, outputDir, generatedStaticDir },
  };
}

async function createRegistrationFixture(t: TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), "public-benchmark-registration-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const publicDir = path.join(root, "public");
  const catalogDir = path.join(publicDir, "catalog");
  const dataDir = path.join(publicDir, "data");
  await Promise.all([
    mkdir(catalogDir, { recursive: true }),
    mkdir(dataDir, { recursive: true }),
  ]);
  await Promise.all([
    copyFile(
      new URL("../viewer/public/catalog/v1.json", import.meta.url),
      path.join(catalogDir, "v1.json"),
    ),
    copyFile(
      new URL("../viewer/public/data/synthetic-demo.json", import.meta.url),
      path.join(dataDir, "synthetic-demo.json"),
    ),
    copyFile(
      new URL("../viewer/public/data/synthetic-demo.manifest.json", import.meta.url),
      path.join(dataDir, "synthetic-demo.manifest.json"),
    ),
  ]);
  return {
    root,
    registration: {
      publicDir,
      catalogPath: path.join(catalogDir, "v1.json"),
    },
  };
}

async function makeRegistrationInput(root: string, experimentId: string) {
  const document = structuredClone(sampleDocument);
  document.dataKind = "user_recorded";
  document.experiments[0].id = experimentId;
  const jsonText = `${JSON.stringify(document, null, 2)}\n`;
  const jsonPath = path.join(root, `${experimentId}.json`);
  const manifestPath = path.join(root, `${experimentId}.manifest.json`);
  await writeFile(jsonPath, jsonText);
  await writeFile(
    manifestPath,
    await manifestFor(
      new TextEncoder().encode(jsonText),
      `${experimentId}.json`,
    ),
  );
  return {
    id: "registration-case",
    jsonPath,
    manifestPath,
  };
}

function benchmarkSource(
  experiment: PublicBenchmarkExperiment,
  dataKind: PublicBenchmarkDocument["dataKind"],
): BenchmarkSource {
  return {
    key: `${dataKind}:${experiment.id}`,
    label: dataKind,
    dataKind,
    experiment,
    integrity: "verified",
    registration: "temporary",
    warnings: [],
  };
}
