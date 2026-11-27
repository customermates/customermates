import { disposableEmailBlocklistSet } from "disposable-email-domains-js";

import { env } from "@/env";

let blocklist: Set<string> | null = null;

function domainOf(email: string): string {
  return email
    .slice(email.lastIndexOf("@") + 1)
    .trim()
    .toLowerCase();
}

export function isDisposableEmail(email: string): boolean {
  if (!email.includes("@")) return false;
  blocklist ??= disposableEmailBlocklistSet();
  const labels = domainOf(email).split(".");
  for (let index = 0; index < labels.length - 1; index++) if (blocklist.has(labels.slice(index).join("."))) return true;
  return false;
}

export function refusesDisposableEmail(email: string): boolean {
  return env.APP_MODE === "cloud" && isDisposableEmail(email);
}
