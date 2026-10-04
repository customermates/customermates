import { lookup } from "node:dns/promises";
import { isIP, isIPv4, isIPv6 } from "node:net";

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

const BLOCKED_IPV4_RANGES: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

const LOCAL_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);
const LOCAL_HOSTNAME_SUFFIXES = [".localhost", ".local", ".internal"];

function ipv4ToNumber(address: string): number {
  return address.split(".").reduce((value, octet) => value * 256 + Number(octet), 0);
}

function numberToIpv4(value: number): string {
  return [Math.floor(value / 0x1000000) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff].join(".");
}

function isBlockedIpv4(address: string): boolean {
  const value = ipv4ToNumber(address);

  return BLOCKED_IPV4_RANGES.some(([base, bits]) => {
    const size = 2 ** (32 - bits);
    return Math.floor(value / size) === Math.floor(ipv4ToNumber(base) / size);
  });
}

function parseIpv6Groups(address: string): number[] | null {
  let text = address.toLowerCase();
  const zoneIndex = text.indexOf("%");
  if (zoneIndex !== -1) text = text.slice(0, zoneIndex);

  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    if (!isIPv4(tail)) return null;
    const value = ipv4ToNumber(tail);
    text = `${text.slice(0, lastColon + 1)}${Math.floor(value / 0x10000).toString(16)}:${(value & 0xffff).toString(16)}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;

  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/u.test(group))) return null;

  return groups.map((group) => parseInt(group, 16));
}

function embeddedIpv4(groups: number[]): string | null {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
  const low = numberToIpv4(g6 * 0x10000 + g7);
  const highZero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0;

  if (highZero && g4 === 0 && (g5 === 0 || g5 === 0xffff)) return low;
  if (highZero && g4 === 0xffff && g5 === 0) return low;
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return low;
  if (g0 === 0x2002) return numberToIpv4(g1 * 0x10000 + g2);

  return null;
}

function isBlockedIpv6(address: string): boolean {
  const groups = parseIpv6Groups(address);
  if (!groups) return true;

  if (groups.slice(0, 7).every((group) => group === 0) && (groups[7] === 0 || groups[7] === 1)) return true;

  const embedded = embeddedIpv4(groups);
  if (embedded !== null) return isBlockedIpv4(embedded);

  const [g0, g1] = groups;
  if ((g0 & 0xe000) !== 0x2000) return true;
  if (g0 === 0x2001 && g1 < 0x0200) return true;
  if (g0 === 0x2001 && g1 === 0x0db8) return true;
  if (g0 === 0x3fff && g1 < 0x1000) return true;

  return false;
}

export function isNonPublicAddress(address: string): boolean {
  if (isIPv4(address)) return isBlockedIpv4(address);
  if (isIPv6(address)) return isBlockedIpv6(address);

  return true;
}

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
  if (isIP(hostname)) return isNonPublicAddress(hostname);

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
    if (!allowPrivateDestinations && isNonPublicAddress(hostname)) return null;
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
  if (!allowPrivateDestinations && addresses.some((record) => isNonPublicAddress(record.address))) return null;

  return {
    address: addresses[0].address,
    family: addresses[0].family,
    addresses: addresses.map(({ address, family }) => ({ address, family })),
  };
}
