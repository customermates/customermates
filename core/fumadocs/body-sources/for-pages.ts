import { loader } from "fumadocs-core/source";
import { toFumadocsSource } from "fumadocs-mdx/runtime/server";

import { COLLECTION_LOADERS } from "../collections";

import { forPages } from "@/.source/bodies/forPages";

export const forPagesBodySource = loader({
  ...COLLECTION_LOADERS.forPages,
  source: toFumadocsSource(forPages, []),
});
