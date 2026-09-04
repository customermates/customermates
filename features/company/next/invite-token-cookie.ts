import "server-only";

import { cookies } from "next/headers";

export const INVITE_TOKEN_COOKIE_NAME = "inviteToken";

export async function readInviteTokenCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(INVITE_TOKEN_COOKIE_NAME)?.value;
}

export async function clearInviteTokenCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(INVITE_TOKEN_COOKIE_NAME);
}
