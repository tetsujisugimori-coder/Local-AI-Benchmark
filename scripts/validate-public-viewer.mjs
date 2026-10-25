import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateCatalog,
  verifyBenchmarkPair,
} from "../viewer/src/lib/viewer-data.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "viewer", "public");
const catalog = JSON.parse(
  await readFile(path.join(publicDir, "catalog", "v1.json"), "utf8"),
);
validateCatalog(catalog);
const experimentIds = new Set();
const expectedFiles = new Set(["catalog/v1.json"]);
for (const entry of catalog.entries) {
  const pair = await verifyBenchmarkPair({
    jsonBytes: new Uint8Array(await readFile(path.join(publicDir, entry.dataFile))),
    manifestBytes: new Uint8Array(
      await readFile(path.join(publicDir, entry.manifestFile)),
    ),
    expectedDataKind: entry.dataKind,
  });
  for (const experiment of pair.document.experiments) {
    if (experimentIds.has(experiment.id)) {
      throw new Error(`Duplicate experiment ID in catalog: ${experiment.id}`);
    }
    experimentIds.add(experiment.id);
  }
  expectedFiles.add(entry.dataFile);
  expectedFiles.add(entry.manifestFile);
}

const dataFiles = await readdir(path.join(publicDir, "data"));
for (const file of dataFiles) {
  if (!expectedFiles.has(`data/${file}`)) {
    throw new Error(`Uncatalogued public data file: data/${file}`);
  }
}
for (const expected of expectedFiles) {
  if (expected === "catalog/v1.json") continue;
  if (!dataFiles.includes(path.basename(expected))) {
    throw new Error(`Catalog file is missing: ${expected}`);
  }
}

const outputDir = path.join(root, "viewer", "out");
await stat(outputDir);
const outputFiles = await listFiles(outputDir);
if (!outputFiles.includes("index.html")) {
  throw new Error("Static viewer output does not contain index.html.");
}
const allowedJson = new Set(expectedFiles);
const outputJson = outputFiles.filter((file) => file.toLowerCase().endsWith(".json"));
for (const file of outputJson) {
  if (!allowedJson.has(file)) {
    throw new Error(`Unexpected JSON in static output: ${file}`);
  }
}
for (const file of outputFiles) {
  if (
    /(?:^|\/)(?:\.env[^/]*|\.local-data|api)(?:\/|$)|\.(?:pem|key|log|sqlite|db)$/i.test(
      file,
    )
  ) {
    throw new Error(`Forbidden file in static output: ${file}`);
  }
  const content = await readFile(path.join(outputDir, file));
  const asText = content.toString("utf8");
  if (
    /OLLAMA_BASE_URL|OLLAMA_REQUEST_TIMEOUT_MS|\/api\/ollama\/|\/api\/benchmark\/run|\.env\.local|\.local-data/i.test(
      asText,
    )
  ) {
    throw new Error(`Local runtime configuration leaked into static output: ${file}`);
  }
}

console.log(
  `Viewer catalog validated: ${catalog.entries.length} entries, ${experimentIds.size} experiments; static output checked (${outputFiles.length} files).`,
);

async function listFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) {
      throw new Error(`Symlink is forbidden in static output: ${relative}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path.join(directory, entry.name), relative)));
    } else {
      files.push(relative);
    }
  }
  return files;
}
