import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  validateCatalog,
  verifyBenchmarkPair,
} from "../viewer/src/lib/viewer-data.ts";

export const FRAMEWORK_OUTPUT_FILES = [
  "404.html",
  "404/index.html",
  "index.html",
  "index.txt",
  "__next.__PAGE__.txt",
  "__next._full.txt",
  "__next._head.txt",
  "__next._index.txt",
  "__next._tree.txt",
  "_not-found/index.html",
  "_not-found/index.txt",
  "_not-found/__next._full.txt",
  "_not-found/__next._head.txt",
  "_not-found/__next._index.txt",
  "_not-found/__next._not-found.txt",
  "_not-found/__next._tree.txt",
];

export const OPTIONAL_FRAMEWORK_OUTPUT_FILES = [
  "_not-found/__next._not-found.__PAGE__.txt",
  "_not-found/__next._not-found/__PAGE__.txt",
];

export async function validatePublicViewerFiles({
  publicDir,
  outputDir,
  generatedStaticDir,
}) {
  const catalogPath = path.join(publicDir, "catalog", "v1.json");
  const catalogBytes = await readRegularFile(catalogPath);
  let catalog;
  try {
    catalog = JSON.parse(catalogBytes.toString("utf8"));
  } catch {
    throw new Error("公開カタログJSONの構文が不正です。");
  }
  validateCatalog(catalog);

  const expectedPublicFiles = new Set(["catalog/v1.json"]);
  const experimentIds = new Set();
  for (const entry of catalog.entries) {
    const jsonBytes = await readRegularFile(
      path.join(publicDir, ...entry.dataFile.split("/")),
    );
    const manifestBytes = await readRegularFile(
      path.join(publicDir, ...entry.manifestFile.split("/")),
    );
    const pair = await verifyBenchmarkPair({
      jsonBytes: new Uint8Array(jsonBytes),
      manifestBytes: new Uint8Array(manifestBytes),
      expectedDataKind: entry.dataKind,
    });
    for (const experiment of pair.document.experiments) {
      if (experimentIds.has(experiment.id)) {
        throw new Error(`Catalog contains a duplicate experiment ID: ${experiment.id}`);
      }
      experimentIds.add(experiment.id);
    }
    expectedPublicFiles.add(entry.dataFile);
    expectedPublicFiles.add(entry.manifestFile);
  }
  await assertTreeMatches(publicDir, expectedPublicFiles, "viewer/public");

  const generatedStaticFiles = await listRegularFiles(generatedStaticDir);
  const currentOutput = await listTree(outputDir, "viewer/out");
  const frameworkBuildDirectories = generatedStaticFiles
    .filter((file) => file.includes("/") && !file.startsWith("chunks/"))
    .map((file) => `_next/${file.split("/")[0]}`);
  const expectedOutputFiles = new Set([
    ...expectedPublicFiles,
    ...FRAMEWORK_OUTPUT_FILES,
    ...OPTIONAL_FRAMEWORK_OUTPUT_FILES.filter((file) =>
      currentOutput.files.has(file),
    ),
    ...generatedStaticFiles.map(outputAssetPath),
  ]);
  await assertTreeMatches(
    outputDir,
    expectedOutputFiles,
    "viewer/out",
    frameworkBuildDirectories,
  );

  for (const relative of expectedPublicFiles) {
    const source = await readRegularFile(
      path.join(publicDir, ...relative.split("/")),
    );
    const output = await readRegularFile(
      path.join(outputDir, ...relative.split("/")),
    );
    if (!source.equals(output)) {
      throw new Error(`Static output differs from public source: ${relative}`);
    }
  }
  for (const relative of generatedStaticFiles) {
    const source = await readRegularFile(
      path.join(generatedStaticDir, ...relative.split("/")),
    );
    const output = await readRegularFile(
      path.join(outputDir, ...outputAssetPath(relative).split("/")),
    );
    if (!source.equals(output)) {
      throw new Error(`Static framework asset differs from build output: ${relative}`);
    }
  }

  for (const relative of expectedOutputFiles) {
    const content = await readRegularFile(
      path.join(outputDir, ...relative.split("/")),
    );
    if (
      /(?:^|\/)(?:\.env[^/]*|\.local-data|api)(?:\/|$)|\.(?:pem|key|log|sqlite|db)$/i.test(
        relative,
      )
    ) {
      throw new Error(`Forbidden file in static output: ${relative}`);
    }
    if (
      /OLLAMA_BASE_URL|OLLAMA_REQUEST_TIMEOUT_MS|\/api\/ollama\/|\/api\/benchmark\/run|\.env\.local|\.local-data/i.test(
        content.toString("utf8"),
      )
    ) {
      throw new Error(`Local runtime configuration leaked into static output: ${relative}`);
    }
  }

  return {
    catalogEntries: catalog.entries.length,
    experimentCount: experimentIds.size,
    outputFileCount: expectedOutputFiles.size,
  };
}

function outputAssetPath(relative) {
  return `_next/static/${relative}`;
}

async function assertTreeMatches(
  root,
  expectedFiles,
  label,
  additionalDirectories = [],
) {
  const expectedDirectories = new Set(additionalDirectories);
  for (const file of expectedFiles) {
    const normalized = path.posix.normalize(file);
    if (
      normalized !== file ||
      normalized.startsWith("../") ||
      normalized.startsWith("/") ||
      file.includes("\\")
    ) {
      throw new Error(`Non-normalized allowlist path in ${label}: ${file}`);
    }
    let parent = path.posix.dirname(file);
    while (parent !== ".") {
      expectedDirectories.add(parent);
      parent = path.posix.dirname(parent);
    }
  }
  const actual = await listTree(root, label);
  for (const file of actual.files) {
    if (!expectedFiles.has(file)) {
      throw new Error(`Unexpected file in ${label}: ${file}`);
    }
  }
  for (const file of expectedFiles) {
    if (!actual.files.has(file)) {
      throw new Error(`Required file missing from ${label}: ${file}`);
    }
  }
  for (const directory of actual.directories) {
    if (!expectedDirectories.has(directory)) {
      throw new Error(`Unexpected directory in ${label}: ${directory}`);
    }
  }
}

async function listTree(root, label) {
  const files = new Set();
  const directories = new Set();
  const rootInfo = await lstat(root);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
    throw new Error(`${label} must be a real directory.`);
  }
  async function visit(directory, prefix = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const fullPath = path.join(directory, entry.name);
      const info = await lstat(fullPath);
      if (info.isSymbolicLink()) {
        throw new Error(`Symlink is forbidden in ${label}: ${relative}`);
      }
      if (info.isDirectory()) {
        directories.add(relative);
        await visit(fullPath, relative);
      } else if (info.isFile()) {
        files.add(relative);
      } else {
        throw new Error(`Non-regular file is forbidden in ${label}: ${relative}`);
      }
    }
  }
  await visit(root);
  return { files, directories };
}

async function listRegularFiles(root) {
  const tree = await listTree(root, "viewer/.next/static");
  return [...tree.files].sort();
}

async function readRegularFile(filePath) {
  const info = await lstat(filePath);
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new Error(`Expected a regular file: ${filePath}`);
  }
  return readFile(filePath);
}
