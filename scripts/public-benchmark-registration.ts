import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  validateCatalog,
  verifyBenchmarkPair,
} from "../viewer/src/lib/viewer-data.ts";
import type { PublicBenchmarkDocument } from "../src/types/public-benchmark.ts";

const defaultIo = { mkdir, open, readFile, rename, rm };
type RegistrationIo = Omit<typeof defaultIo, "readFile"> & {
  readFile: (filePath: string) => Promise<Buffer>;
};

export async function registerPublicBenchmark({
  publicDir,
  catalogPath,
  id,
  jsonBytes,
  manifestBytes,
  reviewedBy,
  reviewNote,
  acknowledgeWarnings = false,
  io: overrides = {},
}: {
  publicDir: string;
  catalogPath: string;
  id: string;
  jsonBytes: Uint8Array;
  manifestBytes: Uint8Array;
  reviewedBy: string;
  reviewNote: string;
  acknowledgeWarnings?: boolean;
  io?: Partial<RegistrationIo>;
}): Promise<PublicBenchmarkDocument["dataKind"]> {
  const io: RegistrationIo = {
    ...defaultIo,
    ...overrides,
    readFile: overrides.readFile ?? ((filePath) => readFile(filePath)),
  };
  const lockPath = `${catalogPath}.lock`;
  const lock = await io.open(lockPath, "wx");
  try {
    return await registerWithCatalogLock({
      publicDir,
      catalogPath,
      id,
      jsonBytes,
      manifestBytes,
      reviewedBy,
      reviewNote,
      acknowledgeWarnings,
      io,
    });
  } finally {
    try {
      await lock.close();
    } finally {
      await io.rm(lockPath, { force: true });
    }
  }
}

async function registerWithCatalogLock({
  publicDir,
  catalogPath,
  id,
  jsonBytes,
  manifestBytes,
  reviewedBy,
  reviewNote,
  acknowledgeWarnings,
  io,
}: {
  publicDir: string;
  catalogPath: string;
  id: string;
  jsonBytes: Uint8Array;
  manifestBytes: Uint8Array;
  reviewedBy: string;
  reviewNote: string;
  acknowledgeWarnings?: boolean;
  io: RegistrationIo;
}): Promise<PublicBenchmarkDocument["dataKind"]> {
  const verified = await verifyBenchmarkPair({ jsonBytes, manifestBytes });
  if (verified.warnings.length > 0 && !acknowledgeWarnings) {
    throw new Error(
      "Scanner warnings require human review and --acknowledge-warnings.",
    );
  }

  const originalCatalogBytes = await io.readFile(catalogPath);
  let catalog: unknown;
  try {
    catalog = JSON.parse(originalCatalogBytes.toString("utf8"));
  } catch {
    throw new Error("Existing public catalog is invalid JSON.");
  }
  validateCatalog(catalog);
  if (catalog.entries.some((entry) => entry.id === id)) {
    throw new Error(`Catalog entry '${id}' already exists.`);
  }
  const existingExperimentIds = new Set<string>();
  for (const entry of catalog.entries) {
    const existingJson = new Uint8Array(
      await io.readFile(path.join(publicDir, ...entry.dataFile.split("/"))),
    );
    const existingManifest = new Uint8Array(
      await io.readFile(path.join(publicDir, ...entry.manifestFile.split("/"))),
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

  const dataFile = `data/${id}.json`;
  const manifestFile = `data/${id}.manifest.json`;
  const jsonTarget = path.join(publicDir, ...dataFile.split("/"));
  const manifestTarget = path.join(publicDir, ...manifestFile.split("/"));
  const catalogTemp = `${catalogPath}.${process.pid}.${randomUUID()}.tmp`;
  let jsonCreated = false;
  let manifestCreated = false;
  let catalogTempCreated = false;
  try {
    await io.mkdir(path.dirname(jsonTarget), { recursive: true });
    jsonCreated = await writeExclusiveBytes(io, jsonTarget, jsonBytes);
    manifestCreated = await writeExclusiveBytes(io, manifestTarget, manifestBytes);
    const persistedJson = new Uint8Array(await io.readFile(jsonTarget));
    const persistedManifest = new Uint8Array(await io.readFile(manifestTarget));
    const persisted = await verifyBenchmarkPair({
      jsonBytes: persistedJson,
      manifestBytes: persistedManifest,
      expectedDataKind: verified.document.dataKind,
    });
    if (
      persistedJson.byteLength !== jsonBytes.byteLength ||
      persistedJson.some((byte, index) => byte !== jsonBytes[index]) ||
      persistedManifest.byteLength !== manifestBytes.byteLength ||
      persistedManifest.some((byte, index) => byte !== manifestBytes[index])
    ) {
      throw new Error("Registered files differ from the verified input bytes.");
    }

    const nextCatalog = {
      catalogVersion: 1 as const,
      entries: [
        ...catalog.entries,
        {
          id,
          dataFile,
          manifestFile,
          dataKind: persisted.document.dataKind,
          reviewedAt: new Date().toISOString(),
          reviewedBy,
          reviewNote,
        },
      ],
    };
    validateCatalog(nextCatalog);
    catalogTempCreated = await writeExclusiveBytes(
      io,
      catalogTemp,
      new TextEncoder().encode(`${JSON.stringify(nextCatalog, null, 2)}\n`),
    );
    const currentCatalogBytes = await io.readFile(catalogPath);
    if (!currentCatalogBytes.equals(originalCatalogBytes)) {
      throw new Error("Public catalog changed during registration; refusing to overwrite it.");
    }
    await io.rename(catalogTemp, catalogPath);
    catalogTempCreated = false;
    return persisted.document.dataKind;
  } catch (error) {
    if (catalogTempCreated) await io.rm(catalogTemp, { force: true });
    if (manifestCreated) await io.rm(manifestTarget, { force: true });
    if (jsonCreated) await io.rm(jsonTarget, { force: true });
    throw error;
  }
}

async function writeExclusiveBytes(
  io: RegistrationIo,
  destination: string,
  bytes: Uint8Array,
): Promise<boolean> {
  const handle = await io.open(destination, "wx");
  try {
    await handle.writeFile(bytes);
  } catch (error) {
    try {
      await handle.close();
    } finally {
      await io.rm(destination, { force: true });
    }
    throw error;
  }
  await handle.close();
  return true;
}
