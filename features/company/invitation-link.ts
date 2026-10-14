import { z } from "zod";
import { headers } from "next/headers";

import { resolveRequestOrigin } from "@/core/config/environment";
import { env } from "@/env";

export const InvitationLinkRequestSchema = z.object({}).strict();

export const InvitationLinkSchema = z.object({
  link: z.string().describe("The workspace invitation link: anyone who opens it before expiresAt can request to join."),
  expiresAt: z.date(),
});

export async function invitationLink(token: string): Promise<string> {
  const requestOrigin = (await headers()).get("origin") ?? env.BASE_URL;
  return `${resolveRequestOrigin(requestOrigin, env.AUTH_ALLOWED_HOSTS, env.BASE_URL)}/invitation/${token}`;
}
