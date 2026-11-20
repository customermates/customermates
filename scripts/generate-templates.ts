import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";

import { driftedOutputs, generatedOutputs, staleGeneratedFiles } from "./lib/template-generated";

const outputs = generatedOutputs();
const check = process.argv.includes("--check");
const drifted = driftedOutputs(outputs);
const stale = staleGeneratedFiles(outputs);

if (check) {
  for (const path of [...drifted, ...stale]) console.error(`Out of date: ${relative(process.cwd(), path)}`);
  process.exit(drifted.length + stale.length ? 1 : 0);
}

for (const path of drifted) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, outputs.get(path) ?? "");
  console.log(`Wrote ${relative(process.cwd(), path)}`);
}
for (const path of stale) {
  rmSync(path);
  console.log(`Removed ${relative(process.cwd(), path)}`);
}
if (!drifted.length && !stale.length) console.log("Templates are up to date.");
