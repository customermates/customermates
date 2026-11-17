import type { z } from "zod";
import type { Validated } from "@/core/validation/validation.utils";
import type { AgentRunnerBodyReader } from "./agent-runner.schema";

import { getZodParseContext } from "@/core/validation/zod-error-map-server";

export async function readAgentRunnerBody<T>(
  request: { readBody: AgentRunnerBodyReader },
  schema: z.ZodType<T>,
): Validated<T> {
  const body = await request.readBody();
  const parsed = await schema.safeParseAsync(body ?? {}, await getZodParseContext());
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: parsed.error };
}
