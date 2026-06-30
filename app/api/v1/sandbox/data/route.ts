import type { NextRequest } from "next/server";
import type { ExtendedUser } from "@/features/user/user.types";

import { getUserService } from "@/core/di";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { verifyRunToken } from "@/features/code-exec/run-token";
import { runSandboxRead, runSandboxTool } from "@/features/code-exec/sandbox-data.service";

export const maxDuration = 60;

// The sandbox can pull a fair amount of data, but not unbounded — keep results
// from blowing up memory / the model context downstream.
const MAX_RESPONSE_BYTES = 1_000_000;

/**
 * Read-only data broker for sandboxed code. This is the ONLY network destination
 * the sandbox is allowed to reach. Auth is the run token (HMAC, short-lived,
 * tenant-bound); the tenant scope is derived SERVER-SIDE from the token and the
 * loaded user — never from the request body. All reads run through the existing
 * tenant guard + RBAC via runWithTenant.
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get("x-sandbox-token");
  if (!token) return Response.json({ ok: false, error: "missing run token" }, { status: 401 });

  const claims = verifyRunToken(token);
  if (!claims) return Response.json({ ok: false, error: "invalid or expired run token" }, { status: 401 });

  let user: ExtendedUser;
  try {
    user = await getUserService().loadActiveUserByIdUnscoped(claims.userId);
  } catch {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Defense in depth: the loaded user's company must match the token's claim.
  if (user.companyId !== claims.companyId)
    return Response.json({ ok: false, error: "tenant mismatch" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const operation = typeof body?.operation === "string" ? body.operation : "";
  const params = body?.params ?? {};

  // "tool" invokes a backend tool server-side in the tenant context (gated by the
  // token's "tool" capability + a per-run cap); everything else is a read op.
  const result = await runWithTenant(user, () =>
    operation === "tool"
      ? runSandboxTool(params, { jti: claims.jti, caps: claims.caps, companyId: claims.companyId })
      : runSandboxRead(operation, params, { jti: claims.jti }),
  );

  const payload = JSON.stringify(result);
  if (payload.length > MAX_RESPONSE_BYTES) {
    return Response.json(
      { ok: false, error: `Result too large (${payload.length} bytes). Narrow it with filters or pagination.` },
      { status: 413 },
    );
  }
  return new Response(payload, {
    status: result.ok ? 200 : 400,
    headers: { "content-type": "application/json" },
  });
}
