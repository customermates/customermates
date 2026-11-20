import { loader } from "fumadocs-core/source";
import { toFumadocsSource } from "fumadocs-mdx/runtime/server";

import { COLLECTION_LOADERS } from "../collections";

import { about } from "@/.source/bodies/about";

export const aboutBodySource = loader({
  ...COLLECTION_LOADERS.about,
  source: toFumadocsSource(about, []),
});
