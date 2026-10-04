import type { OvhClassifierModel } from "./ovh-runner";

export type ClassifierModel = "jev" | OvhClassifierModel;

export type ClassifierUse = "docs_rerank" | "wiki_rerank" | "wiki_synthesis_review";

export const CLASSIFIER_MODELS = {
  docs_rerank: "jev",
  wiki_rerank: "jev",
  wiki_synthesis_review: "ovh/Qwen3.8-27B",
} as const satisfies Readonly<Record<ClassifierUse, ClassifierModel>>;
