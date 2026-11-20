import { loader } from "fumadocs-core/source";
import { toFumadocsSource } from "fumadocs-mdx/runtime/server";

import { COLLECTION_LOADERS } from "../collections";

import { featurePages } from "@/.source/bodies/featurePages";

export const featurePagesBodySource = loader({
  ...COLLECTION_LOADERS.featurePages,
  source: toFumadocsSource(featurePages, []),
});
