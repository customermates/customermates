import { loader } from "fumadocs-core/source";
import { toFumadocsSource } from "fumadocs-mdx/runtime/server";

import { COLLECTION_LOADERS } from "../collections";

import { legal } from "@/.source/bodies/legal";

export const legalBodySource = loader({
  ...COLLECTION_LOADERS.legal,
  source: toFumadocsSource(legal, []),
});
