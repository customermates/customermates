import { afterEach, describe, expect, it, vi } from "vitest";

async function load() {
  vi.resetModules();
  return import("../connect-channels");
}

describe("Facebook Messenger release switch", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([undefined, "", "false", "1", "TRUE"])(
    "does not offer Facebook Messenger when the switch is %s",
    async (value) => {
      if (value !== undefined) vi.stubEnv("NEXT_PUBLIC_FACEBOOK_MESSENGER", value);
      const { CONNECT_CHANNEL_KEYS, isConnectChannelReleased } = await load();

      expect(isConnectChannelReleased("facebook")).toBe(false);
      expect(CONNECT_CHANNEL_KEYS).not.toContain("facebook");
      expect(CONNECT_CHANNEL_KEYS).toEqual([
        "google",
        "outlook",
        "imap",
        "whatsapp",
        "linkedin",
        "linkedin_sales_navigator",
        "linkedin_recruiter",
        "instagram",
        "telegram",
      ]);
    },
  );

  it("offers Facebook Messenger as a Unipile facebook account once switched on", async () => {
    vi.stubEnv("NEXT_PUBLIC_FACEBOOK_MESSENGER", "true");
    const { CONNECT_CHANNELS, CONNECT_CHANNEL_KEYS, isConnectChannelReleased } = await load();

    expect(isConnectChannelReleased("facebook")).toBe(true);
    expect(CONNECT_CHANNEL_KEYS).toContain("facebook");
    expect(CONNECT_CHANNELS.facebook).toEqual({ providers: ["facebook"] });
  });
});
