import { loader } from "fumadocs-core/source";
import { toFumadocsSource } from "fumadocs-mdx/runtime/server";

import { COLLECTION_LOADERS } from "../collections";

import { apiDocs } from "@/.source/bodies/apiDocs";

export const apiDocsBodySource = loader({
  ...COLLECTION_LOADERS.apiDocs,
  source: toFumadocsSource(apiDocs, []),
});
