import type { ConnectChannel } from "@/ee/messaging/connect/connect-channels";

import { CONNECT_CHANNEL_KEYS } from "@/ee/messaging/connect/connect-channels";
import { ONBOARDING_ORIGIN_QUERY_PARAM, ONBOARDING_ORIGIN_VALUE } from "@/features/onboarding-funnel/onboarding-job";

export const ONBOARDING_CONNECT_STORAGE_KEY = "customermates:onboarding-connect";
export const ONBOARDING_CONNECTED_QUERY_PARAM = "connected";

const ONBOARDING_CONNECT_MAX_AGE_MS = 30 * 60_000;

export function parseConnectChannel(value: unknown): ConnectChannel | null {
  return typeof value === "string" && (CONNECT_CHANNEL_KEYS as readonly string[]).includes(value)
    ? (value as ConnectChannel)
    : null;
}

export function rememberOnboardingConnect(channel: ConnectChannel, now = Date.now()): void {
  try {
    window.sessionStorage.setItem(ONBOARDING_CONNECT_STORAGE_KEY, JSON.stringify({ channel, at: now }));
  } catch {
    return;
  }
}

export function readOnboardingConnect(now = Date.now()): ConnectChannel | null {
  try {
    const stored: unknown = JSON.parse(window.sessionStorage.getItem(ONBOARDING_CONNECT_STORAGE_KEY) ?? "null");
    if (!stored || typeof stored !== "object") return null;
    const { channel, at } = stored as { channel?: unknown; at?: unknown };
    if (typeof at !== "number" || now - at < 0 || now - at > ONBOARDING_CONNECT_MAX_AGE_MS) return null;
    return parseConnectChannel(channel);
  } catch {
    return null;
  }
}

export function forgetOnboardingConnect(): void {
  try {
    window.sessionStorage.removeItem(ONBOARDING_CONNECT_STORAGE_KEY);
  } catch {
    return;
  }
}

export function withOnboardingReturn(params: URLSearchParams, channel: ConnectChannel, connected: boolean): void {
  params.set(ONBOARDING_ORIGIN_QUERY_PARAM, ONBOARDING_ORIGIN_VALUE);
  if (connected) params.set(ONBOARDING_CONNECTED_QUERY_PARAM, channel);
  else params.delete(ONBOARDING_CONNECTED_QUERY_PARAM);
}
