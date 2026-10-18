import { createHash, randomUUID } from "node:crypto";

export const localOAuthClients = {
  google: { id: "e2e-local-google-client", secret: "e2e-local-google-secret" },
  microsoft: { id: "e2e-local-microsoft-client", secret: "e2e-local-microsoft-secret" },
};

export const localOAuthAuthorizationEndpoints = {
  google: "https://accounts.google.com/o/oauth2/v2/auth",
  microsoft: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
};

const tokenEndpoints = {
  "https://oauth2.googleapis.com/token": "google",
  "https://login.microsoftonline.com/common/oauth2/v2.0/token": "microsoft",
};

const issuers = {
  google: "https://accounts.google.com",
  microsoft: "https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0",
};

const configuredClientIds = { google: "GOOGLE_CLIENT_ID", microsoft: "AZURE_AD_CLIENT_ID" };
const configuredClientSecrets = { google: "GOOGLE_CLIENT_SECRET", microsoft: "AZURE_AD_CLIENT_SECRET" };

export function localOAuthEnvironment(provider) {
  const client = localOAuthClients[provider];
  return { [configuredClientIds[provider]]: client.id, [configuredClientSecrets[provider]]: client.secret };
}

function base64url(value) {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
}

function isConfigured(provider) {
  const client = localOAuthClients[provider];
  return (
    process.env[configuredClientIds[provider]] === client.id &&
    process.env[configuredClientSecrets[provider]] === client.secret
  );
}

export function localOAuthCode(grant) {
  if (!grant.identity?.email || !grant.identity?.sub || !grant.codeChallenge || !grant.redirectUri)
    throw new Error("A local authorization code names an identity, the PKCE challenge and the redirect URI");
  return `e2e_${base64url({ ...grant, nonce: randomUUID() })}`;
}

function decodeCode(code) {
  if (typeof code !== "string" || !code.startsWith("e2e_")) return null;
  try {
    return JSON.parse(Buffer.from(code.slice(4), "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function oauthError(status, error, description) {
  return Promise.resolve(Response.json({ error, error_description: description }, { status }));
}

function idToken(provider, clientId, identity) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: issuers[provider],
    aud: clientId,
    sub: identity.sub,
    email: identity.email,
    name: identity.name,
    given_name: identity.givenName,
    family_name: identity.familyName,
    iat: now,
    exp: now + 3600,
    ...(provider === "google" ? { email_verified: identity.emailVerified ?? true } : {}),
    ...(provider === "microsoft" && identity.emailVerified !== false
      ? { verified_primary_email: [identity.email] }
      : {}),
  };
  return `${base64url({ alg: "RS256", kid: "e2e-local", typ: "JWT" })}.${base64url(claims)}.${base64url("e2e-local-unsigned")}`;
}

async function exchangeCode(provider, request) {
  const form = new URLSearchParams(await request.text());
  const client = localOAuthClients[provider];
  if (form.get("grant_type") !== "authorization_code") return oauthError(400, "unsupported_grant_type", "local");
  if (form.get("client_id") !== client.id || form.get("client_secret") !== client.secret)
    return oauthError(401, "invalid_client", "The local OAuth client is not configured");
  const grant = decodeCode(form.get("code"));
  if (!grant || grant.provider !== provider)
    return oauthError(400, "invalid_grant", "Unknown local authorization code");
  if (form.get("redirect_uri") !== grant.redirectUri)
    return oauthError(400, "invalid_grant", "The redirect URI differs from the authorization request");
  const verifier = form.get("code_verifier") ?? "";
  if (createHash("sha256").update(verifier).digest("base64url") !== grant.codeChallenge)
    return oauthError(400, "invalid_grant", "The PKCE verifier does not match the challenge");
  return Response.json({
    access_token: `e2e-local-access-${randomUUID()}`,
    token_type: "Bearer",
    expires_in: 3599,
    scope: "openid email profile",
    id_token: idToken(provider, client.id, grant.identity),
  });
}

export function localOAuthRequest(input, init) {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.username || url.password || url.search) return null;
  if (
    url.origin === "https://graph.microsoft.com" &&
    /^\/v1\.0\/me\/photos\/\d+x\d+\/(?:\$|%24)value$/.test(url.pathname) &&
    isConfigured("microsoft")
  )
    return Promise.resolve(new Response(null, { status: 404 }));
  const provider = tokenEndpoints[`${url.origin}${url.pathname}`];
  if (!provider || !isConfigured(provider)) return null;
  const request = new Request(input, init);
  if (request.method !== "POST") return null;
  return exchangeCode(provider, request);
}
