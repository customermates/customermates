import type { CaptureContext } from "./capture-context";

export async function requestErrorContext(headers: Headers): Promise<{
  authenticated: boolean;
  context: CaptureContext;
}> {
  const anonymous = { authenticated: false, context: {} };
  if (headers.has("x-api-key") || /^Bearer\s/i.test(headers.get("authorization") ?? "")) return anonymous;
  if (!/(?:^|;\s*)(?:__Secure-)?app\.session_token=/.test(headers.get("cookie") ?? "")) return anonymous;
  let authenticated = false;
  try {
    const { auth } = await import("@/core/auth/better-auth");
    const session = await auth.api.getSession({
      headers,
      query: { disableRefresh: true },
    });
    if (!session) return anonymous;
    authenticated = true;
    const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
    const user = await new PrismaUserRepo().findCurrentUserUnscoped(session.user.email);
    if (!user || user.companyId !== session.user.companyId) return { authenticated, context: {} };
    return {
      authenticated,
      context: { user: { id: user.id }, tags: { companyId: user.companyId } },
    };
  } catch {
    return { authenticated, context: {} };
  }
}
