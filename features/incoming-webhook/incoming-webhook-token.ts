import { signedIdToken, signedTokenValid, unverifiedIdOfSignedToken } from "@/core/utils/signed-id";

const PURPOSE = "incoming-webhook";

export function incomingWebhookToken(id: string, version: number, authSecret: string | undefined): string {
  return signedIdToken(PURPOSE, id, authSecret, version);
}

export function incomingWebhookIdFromToken(token: string): string | null {
  return unverifiedIdOfSignedToken(token);
}

export function incomingWebhookTokenValid(
  token: string,
  id: string,
  version: number,
  authSecret: string | undefined,
): boolean {
  return signedTokenValid(PURPOSE, token, id, authSecret, version);
}

export function incomingWebhookUrl(
  baseUrl: string,
  id: string,
  version: number,
  authSecret: string | undefined,
): string {
  return `${baseUrl.replace(/\/$/u, "")}/api/hooks/${incomingWebhookToken(id, version, authSecret)}`;
}
