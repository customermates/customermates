import type { TemplateDeployment, TemplatePublicationOptions } from "./template-publication";

import { env } from "@/env";

export function templateDeployment(): TemplateDeployment {
  return env.APP_MODE === "self-hosted" ? "self-hosted" : "cloud";
}

export function pagePublicationOptions(): TemplatePublicationOptions {
  return { deployment: templateDeployment() };
}
