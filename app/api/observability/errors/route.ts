import { z } from "zod";

import { getAuthService } from "@/core/di";
import { resolveRequestOrigin } from "@/core/config/environment";
import { env } from "@/env";
import { usesVercelErrorReporting } from "@/core/errors/reporting-provider";
import { safeErrorPath, safeIdentifier, scrubErrorText } from "@/core/observability/error-report";
import { publishServerError } from "@/core/observability/publish-error";

export const runtime = "nodejs";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const reportSchema = z.object({
  kind: z.literal("application-error"),
  id,
  buildId: id,
  timestamp: z
    .number()
    .finite()
    .refine((time) => time > Date.now() / 1000 - 7 * 86400 && time < Date.now() / 1000 + 300),
  level: z.enum(["error", "warning", "info"]),
  source: z.literal("browser"),
  name: z.string().max(100),
  message: z.string().max(2000),
  path: z.string().max(500).optional(),
  digest: id.optional(),
  frames: z
    .array(
      z.object({
        file: z.string().max(1000),
        function: z.string().max(200).optional(),
        line: z.number().int().positive().optional(),
        column: z.number().int().nonnegative().optional(),
      }),
    )
    .max(30),
});

const admissions = new Map<string, { until: number; count: number }>();

export async function POST(request: Request): Promise<Response> {
  if (!usesVercelErrorReporting()) return new Response(null, { status: 404 });
  const origin = request.headers.get("origin");
  const host = request.headers.get("host") ?? new URL(request.url).host;
  if (
    !origin ||
    resolveRequestOrigin(origin, env.AUTH_ALLOWED_HOSTS, env.BASE_URL) !== origin ||
    new URL(origin).host !== host
  )
    return new Response(null, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return new Response(null, { status: 415 });

  const address = request.headers.get("x-real-ip") ?? "unknown";
  const now = Date.now();
  for (const [key, admission] of admissions) if (admission.until <= now) admissions.delete(key);
  const admission = admissions.get(address) ?? { until: now + 60_000, count: 0 };
  if (admission.count >= 10 || (!admissions.has(address) && admissions.size >= 1000))
    return new Response(null, { status: 429 });
  admission.count++;
  admissions.set(address, admission);

  const session = await getAuthService().getInteractiveSession();
  if (!session) return new Response(null, { status: 401 });

  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > 40_000) {
      await reader.cancel();
      return new Response(null, { status: 413 });
    }
    chunks.push(chunk.value);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = reportSchema.safeParse(payload);
  if (!parsed.success) return new Response(null, { status: 400 });
  const report = parsed.data;
  try {
    await publishServerError({
      ...report,
      name: scrubErrorText(report.name, 100),
      message: scrubErrorText(report.message),
      path: safeErrorPath(report.path),
      tenant: { userId: safeIdentifier(session.user.id), companyId: safeIdentifier(session.user.companyId) },
      frames: report.frames.map((frame) => ({
        ...frame,
        file: scrubErrorText(frame.file, 1000),
        function: frame.function ? scrubErrorText(frame.function, 200) : undefined,
      })),
    });
  } catch {
    return new Response(null, { status: 503 });
  }
  return new Response(null, { status: 202 });
}
