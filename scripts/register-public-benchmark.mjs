import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAX_BENCHMARK_BYTES,
  MAX_MANIFEST_BYTES,
  validateCatalog,
  verifyBenchmarkPair,
} from "../viewer/src/lib/viewer-data.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "viewer", "public");
const catalogPath = path.join(publicDir, "catalog", "v1.json");
const options = parseArguments(process.argv.slice(2));

if (options.help) {
  console.log(
    "Usage: node scripts/register-public-benchmark.mjs --id <id> --json <path> --manifest <path> --reviewed-by <name> --review-note <note> [--acknowledge-warnings]",
  );
  process.exit(0);
}

const { id, jsonPath, manifestPath, reviewedBy, reviewNote } = options;
if (!id || !/^[a-z0-9][a-z0-9-]{2,63}$/.test(id)) {
  throw new Error("--id must be 3-64 lowercase ASCII letters, digits, or hyphens.");
}
if (!jsonPath || !manifestPath || !reviewedBy || !reviewNote) {
  throw new Error("JSON, manifest, reviewer, and review note are required.");
}
validatePublicNote(reviewedBy, "--reviewed-by", 80);
validatePublicNote(reviewNote, "--review-note", 300);

const jsonBytes = new Uint8Array(await readFile(path.resolve(jsonPath)));
const manifestBytes = new Uint8Array(await readFile(path.resolve(manifestPath)));
if (jsonBytes.byteLength > MAX_BENCHMARK_BYTES) {
  throw new Error("Public JSON exceeds the 2 MiB registration limit.");
}
if (manifestBytes.byteLength > MAX_MANIFEST_BYTES) {
  throw new Error("Manifest exceeds the 32 KiB registration limit.");
}
const verified = await verifyBenchmarkPair({ jsonBytes, manifestBytes });
if (verified.warnings.length > 0 && !options.acknowledgeWarnings) {
  throw new Error(
    "Scanner warnings require human review and --acknowledge-warnings.",
  );
}

const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
validateCatalog(catalog);
if (catalog.entries.some((entry) => entry.id === id)) {
  throw new Error(`Catalog entry '${id}' already exists.`);
}
const existingExperimentIds = new Set();
for (const entry of catalog.entries) {
  const existingJson = new Uint8Array(
    await readFile(path.join(publicDir, entry.dataFile)),
  );
  const existingManifest = new Uint8Array(
    await readFile(path.join(publicDir, entry.manifestFile)),
  );
  const existing = await verifyBenchmarkPair({
    jsonBytes: existingJson,
    manifestBytes: existingManifest,
    expectedDataKind: entry.dataKind,
  });
  for (const experiment of existing.document.experiments) {
    existingExperimentIds.add(experiment.id);
  }
}
for (const experiment of verified.document.experiments) {
  if (existingExperimentIds.has(experiment.id)) {
    throw new Error(`Experiment '${experiment.id}' already exists in the catalog.`);
  }
}

const dataDir = path.join(publicDir, "data");
await mkdir(dataDir, { recursive: true });
const dataFile = `data/${id}.json`;
const manifestFile = `data/${id}.manifest.json`;
const jsonTarget = path.join(publicDir, dataFile);
const manifestTarget = path.join(publicDir, manifestFile);
const catalogTemp = `${catalogPath}.${process.pid}.tmp`;
let jsonCreated = false;
let manifestCreated = false;
try {
  await copyExclusive(jsonPath, jsonTarget);
  jsonCreated = true;
  await copyExclusive(manifestPath, manifestTarget);
  manifestCreated = true;
  const nextCatalog = {
    catalogVersion: 1,
    entries: [
      ...catalog.entries,
      {
        id,
        dataFile,
        manifestFile,
        dataKind: verified.document.dataKind,
        reviewedAt: new Date().toISOString(),
        reviewedBy,
        reviewNote,
      },
    ],
  };
  validateCatalog(nextCatalog);
  await writeFile(catalogTemp, `${JSON.stringify(nextCatalog, null, 2)}\n`, {
    flag: "wx",
  });
  await rename(catalogTemp, catalogPath);
} catch (error) {
  await rm(catalogTemp, { force: true });
  if (manifestCreated) await rm(manifestTarget, { force: true });
  if (jsonCreated) await rm(jsonTarget, { force: true });
  throw error;
}

console.log(`Registered ${id} (${verified.document.dataKind}).`);
console.log("No commit, push, or publication was performed.");

function parseArguments(args) {
  const parsed = { acknowledgeWarnings: false, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      parsed.help = true;
    } else if (argument === "--acknowledge-warnings") {
      parsed.acknowledgeWarnings = true;
    } else if (
      ["--id", "--json", "--manifest", "--reviewed-by", "--review-note"].includes(
        argument,
      )
    ) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${argument}.`);
      }
      const key = {
        "--id": "id",
        "--json": "jsonPath",
        "--manifest": "manifestPath",
        "--reviewed-by": "reviewedBy",
        "--review-note": "reviewNote",
      }[argument];
      parsed[key] = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return parsed;
}

function validatePublicNote(value, label, maxLength) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maxLength ||
    /https?:\/\/|[\u0000-\u001f\u007f]|\b\S+@\S+\.\S+\b|(?:api[_ -]?key|token|password|secret)\s*[:=]/i.test(
      value,
    )
  ) {
    throw new Error(`${label} must be a short, plain, public review note.`);
  }
}

async function copyExclusive(source, destination) {
  const bytes = await readFile(path.resolve(source));
  await writeFile(destination, bytes, { flag: "wx" });
}
