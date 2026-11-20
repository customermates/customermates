import { loader } from "fumadocs-core/source";
import { toFumadocsSource } from "fumadocs-mdx/runtime/server";

import { COLLECTION_LOADERS } from "../collections";

import { comparePages } from "@/.source/bodies/comparePages";

export const comparePagesBodySource = loader({
  ...COLLECTION_LOADERS.comparePages,
  source: toFumadocsSource(comparePages, []),
});
