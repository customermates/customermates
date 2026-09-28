import { DOCS_EMBEDDING_MODEL_KEYS, type DocsEmbeddingModelKey } from "@/core/config/environment";
import { buildDocsEmbeddingIndex, docsEmbeddingCachePath } from "@/ee/agent-chat/docs-embedding";
import { CONTENT_LOCALES } from "@/i18n/locale-registry";

const requested = process.argv.slice(2);
const models = (requested.length ? requested : [process.env.AGENT_DOCS_EMBEDDING_MODEL?.trim() || "qwen3-8b"]).map(
  (model) => {
    if (!(DOCS_EMBEDDING_MODEL_KEYS as readonly string[]).includes(model))
      throw new Error(`Unknown docs embedding model ${model}; use one of ${DOCS_EMBEDDING_MODEL_KEYS.join(", ")}`);
    return model as DocsEmbeddingModelKey;
  },
);

if (!process.env.AI_GATEWAY_API_KEY?.trim()) throw new Error("AI_GATEWAY_API_KEY is required to embed the docs");

for (const model of models) {
  for (const locale of CONTENT_LOCALES) {
    const vectors = await buildDocsEmbeddingIndex(model, locale);
    console.log(`${model} ${locale}: ${vectors.length} sections`);
  }
  console.log(`cached in ${docsEmbeddingCachePath(model)}`);
}
process.exit(0);
