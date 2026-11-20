import { idOfSignedToken, signedIdToken } from "@/core/utils/signed-id";

const PURPOSE = "public-view-link";

export function publicLinkToken(linkId: string, authSecret: string | undefined): string {
  return signedIdToken(PURPOSE, linkId, authSecret);
}

export function publicLinkIdFromToken(token: string, authSecret: string | undefined): string | null {
  return idOfSignedToken(PURPOSE, token, authSecret);
}

export function publicLinkUrl(baseUrl: string, linkId: string, authSecret: string | undefined): string {
  return `${baseUrl.replace(/\/$/u, "")}/p/${publicLinkToken(linkId, authSecret)}`;
}
