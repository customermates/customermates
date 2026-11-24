import { env } from "@/env";
import { DEFAULT_LOCALE } from "@/i18n/locale-registry";

import { agentStartGuide } from "@/core/agent-start/agent-start-guide";
import { templateDeployment } from "@/core/templates/template-deployment";
import { listOfferedTemplates } from "@/core/templates/template-registry";

export function GET() {
  const templates = listOfferedTemplates({ locale: DEFAULT_LOCALE, deployment: templateDeployment() });
  return new Response(agentStartGuide(env.BASE_URL, DEFAULT_LOCALE, templates), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
    status: 200,
  });
}
