import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePublicViewerFiles } from "./public-viewer-validation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = await validatePublicViewerFiles({
  publicDir: path.join(root, "viewer", "public"),
  outputDir: path.join(root, "viewer", "out"),
  generatedStaticDir: path.join(root, "viewer", ".next", "static"),
});

console.log(
  `Viewer catalog validated: ${result.catalogEntries} entries, ${result.experimentCount} experiments; static output checked (${result.outputFileCount} files).`,
);
