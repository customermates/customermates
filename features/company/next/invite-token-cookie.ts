import "server-only";

import { cookies } from "next/headers";

import { InviteTokenCookieRepo } from "../invite-token-cookie.repo";

export const INVITE_TOKEN_COOKIE_NAME = "inviteToken";

export class NextInviteTokenCookieRepo extends InviteTokenCookieRepo {
  async read(): Promise<string | undefined> {
    const cookieStore = await cookies();
    return cookieStore.get(INVITE_TOKEN_COOKIE_NAME)?.value;
  }

  async clear(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete(INVITE_TOKEN_COOKIE_NAME);
  }
}

const inviteTokenCookieRepo = new NextInviteTokenCookieRepo();

export async function readInviteTokenCookie(): Promise<string | undefined> {
  return inviteTokenCookieRepo.read();
}

export async function clearInviteTokenCookie(): Promise<void> {
  return inviteTokenCookieRepo.clear();
}
