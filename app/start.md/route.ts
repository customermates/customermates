import { env } from "@/env";
import { DEFAULT_LOCALE } from "@/i18n/locale-registry";

import { agentStartGuide } from "@/core/agent-start/agent-start-guide";

export function GET() {
  return new Response(agentStartGuide(env.BASE_URL, DEFAULT_LOCALE), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
    status: 200,
  });
}
