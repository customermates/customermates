import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { isPublicIpAddress } from "@/core/network/public-ip-address";
import { env } from "@/env";

export const WEBHOOK_DESTINATION_NOT_ALLOWED_MESSAGE = "Destination not allowed";

export type WebhookAddress = { address: string; family: 4 | 6 };

export type WebhookDestination = WebhookAddress & {
  addresses: WebhookAddress[];
};

export type PrivateDestinationPolicyInput = {
  appMode: "cloud" | "demo" | "self-hosted";
  allowPrivateDestinations?: boolean;
  blockPrivateDestinations?: boolean;
};

const LOCAL_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);
const LOCAL_HOSTNAME_SUFFIXES = [".localhost", ".local", ".internal"];

export function normalizeWebhookHostname(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/^\[(.*)\]$/u, "$1")
    .replace(/\.+$/u, "");
}

export function isLocalWebhookHostname(hostname: string): boolean {
  const normalized = normalizeWebhookHostname(hostname);

  return LOCAL_HOSTNAMES.has(normalized) || LOCAL_HOSTNAME_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

export function resolvePrivateDestinationPolicy(input: PrivateDestinationPolicyInput): boolean {
  if (input.blockPrivateDestinations) return false;
  if (input.appMode === "self-hosted") return true;

  return Boolean(input.allowPrivateDestinations);
}

export function allowsPrivateWebhookDestinations(): boolean {
  return resolvePrivateDestinationPolicy({
    appMode: env.APP_MODE,
    allowPrivateDestinations: env.WEBHOOK_ALLOW_PRIVATE_DESTINATIONS,
    blockPrivateDestinations: env.WEBHOOK_BLOCK_PRIVATE_DESTINATIONS,
  });
}

function parseHttpUrl(url: string | URL): URL | null {
  try {
    const parsed = typeof url === "string" ? new URL(url) : url;
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

export function isWebhookUrlHostBlocked(url: string, allowPrivateDestinations: boolean): boolean {
  if (allowPrivateDestinations) return false;

  const parsed = parseHttpUrl(url);
  if (!parsed) return false;

  const hostname = normalizeWebhookHostname(parsed.hostname);
  if (isIP(hostname)) return !isPublicIpAddress(hostname);

  return isLocalWebhookHostname(hostname);
}

export async function resolveWebhookDestination(
  url: string | URL,
  allowPrivateDestinations: boolean,
): Promise<WebhookDestination | null> {
  const parsed = parseHttpUrl(url);
  if (!parsed) return null;

  const hostname = normalizeWebhookHostname(parsed.hostname);
  const literalFamily = isIP(hostname);

  if (literalFamily === 4 || literalFamily === 6) {
    if (!allowPrivateDestinations && !isPublicIpAddress(hostname)) return null;
    return {
      address: hostname,
      family: literalFamily,
      addresses: [{ address: hostname, family: literalFamily }],
    };
  }

  if (!allowPrivateDestinations && isLocalWebhookHostname(hostname)) return null;

  const records = await lookup(hostname, { all: true, verbatim: true });
  const addresses = records.filter((record): record is WebhookAddress => record.family === 4 || record.family === 6);

  if (addresses.length === 0 || addresses.length !== records.length) return null;
  if (!allowPrivateDestinations && addresses.some((record) => !isPublicIpAddress(record.address))) return null;

  return {
    address: addresses[0].address,
    family: addresses[0].family,
    addresses: addresses.map(({ address, family }) => ({ address, family })),
  };
}
