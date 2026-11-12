import type { TemplatePublicationOptions } from "./template-publication";

import { env } from "@/env";

export function pagePublicationOptions(): TemplatePublicationOptions {
  return { deployment: env.APP_MODE === "self-hosted" ? "self-hosted" : "cloud" };
}
