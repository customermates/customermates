import type { TemplatePublicationOptions } from "./template-publication";

import { env } from "@/env";

import { getTemplateIndex } from "./template-index";
import { previewTemplateIndex, templatePreviewActive } from "./template-preview";

export function pagePublicationOptions(): TemplatePublicationOptions {
  const deployment = env.APP_MODE === "self-hosted" ? "self-hosted" : "cloud";
  if (!templatePreviewActive(env)) return { deployment };

  return { deployment, index: previewTemplateIndex(getTemplateIndex()) };
}
