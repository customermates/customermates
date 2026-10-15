import type { Page } from "@playwright/test";

import { localOAuthAuthorizationEndpoints, localOAuthClients, localOAuthCode } from "./local-oauth-provider.mjs";

export type SocialProvider = keyof typeof localOAuthClients;

export type SocialIdentity = {
  sub: string;
  email: string;
  name: string;
  givenName?: string;
  familyName?: string;
  emailVerified?: boolean;
};

export type SocialAuthorization = {
  clientId: string | null;
  redirectUri: string | null;
  responseType: string | null;
  scopes: string[];
  state: string | null;
  codeChallengeMethod: string | null;
};

export async function routeSocialProvider(page: Page, provider: SocialProvider) {
  const authorizations: SocialAuthorization[] = [];
  let identity: SocialIdentity | null = null;
  const endpoint = localOAuthAuthorizationEndpoints[provider];
  await page.route(
    (url) => `${url.origin}${url.pathname}` === endpoint,
    async (route) => {
      const url = new URL(route.request().url());
      const redirectUri = url.searchParams.get("redirect_uri");
      const state = url.searchParams.get("state");
      const codeChallenge = url.searchParams.get("code_challenge");
      authorizations.push({
        clientId: url.searchParams.get("client_id"),
        redirectUri,
        responseType: url.searchParams.get("response_type"),
        scopes: (url.searchParams.get("scope") ?? "").split(" ").filter(Boolean).sort(),
        state,
        codeChallengeMethod: url.searchParams.get("code_challenge_method"),
      });
      if (!identity || !redirectUri || !state || !codeChallenge) {
        await route.fulfill({ status: 400, contentType: "text/plain", body: "No local identity is signed in" });
        return;
      }
      const callback = new URL(redirectUri);
      callback.searchParams.set("code", localOAuthCode({ provider, identity, codeChallenge, redirectUri }));
      callback.searchParams.set("state", state);
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html lang="en"><head><title>Local sign-in</title></head><body><script>location.replace(${JSON.stringify(callback.toString())})</script></body></html>`,
      });
    },
  );
  return {
    authorizations,
    signInAs(next: SocialIdentity) {
      identity = next;
    },
  };
}

export function expectedAuthorization(provider: SocialProvider, baseUrl: string): Omit<SocialAuthorization, "state"> {
  return {
    clientId: localOAuthClients[provider].id,
    redirectUri: `${baseUrl}/api/auth/callback/${provider}`,
    responseType: "code",
    scopes:
      provider === "google"
        ? ["email", "openid", "profile"]
        : ["User.Read", "email", "offline_access", "openid", "profile"],
    codeChallengeMethod: "S256",
  };
}
