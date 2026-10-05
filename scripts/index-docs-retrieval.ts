import "dotenv/config";

import { getDocsChunkRepo, getDocsSemanticIndexService } from "@/core/di";
import { docsCorpus } from "@/features/mcp-tools/docs-corpus";

const MAX_STEPS = 100;

async function main() {
  const corpus = docsCorpus();
  await getDocsChunkRepo().ensureCorpus(corpus);
  process.stdout.write(`Documentation build ${corpus.buildHash.slice(0, 12)}: ${corpus.chunks.length} chunks stored.\n`);
  if (process.argv.includes("--full-text-only")) return;
  let indexed = 0;
  for (let step = 0; step < MAX_STEPS; step += 1) {
    const result = await getDocsSemanticIndexService().indexPending();
    indexed += result.indexed;
    if (!result.remaining) break;
  }
  process.stdout.write(`Embedded ${indexed} documentation chunks.\n`);
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    process.exit(1);
  },
);
