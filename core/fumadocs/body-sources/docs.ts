import { loader } from "fumadocs-core/source";
import { toFumadocsSource } from "fumadocs-mdx/runtime/server";

import { COLLECTION_LOADERS } from "../collections";

import { docs } from "@/.source/bodies/docs";

export const docsBodySource = loader({
  ...COLLECTION_LOADERS.docs,
  source: toFumadocsSource(docs, []),
});
