import { describe, expect, it } from "vitest";

import { byChannelGroup, channelClass, channelGroup, messagingProviderFor } from "@/ee/messaging/provider";
import { inferChannelProviders, normalizeChannelValue } from "../channel-value";

describe("channel values", () => {
  it("offers typed phone numbers as plain phone channels instead of WhatsApp", () => {
    expect(inferChannelProviders("+49 621 123456")).toEqual(["phone"]);
    expect(inferChannelProviders("0049 621 123456")).toEqual(["phone"]);
    expect(inferChannelProviders("0621 123456", "de")).toEqual(["phone"]);
    expect(inferChannelProviders("(201) 555-0123", "us")).toEqual(["phone"]);
    expect(inferChannelProviders("person@example.test")).toEqual(["mail"]);
    expect(inferChannelProviders("https://www.linkedin.com/in/person")).toEqual(["linkedin"]);
    expect(inferChannelProviders("@person")).toEqual(["linkedin", "telegram", "instagram"]);
  });

  it("normalises phone and WhatsApp numbers with the same rules", () => {
    expect(normalizeChannelValue("phone", "0621 123456", "de")).toBe("+49621123456");
    expect(normalizeChannelValue("phone", "0049 621 123456")).toBe("+49621123456");
    expect(normalizeChannelValue("whatsapp", "0049 621 123456")).toBe("+49621123456");
    expect(normalizeChannelValue("whatsapp", "49621123456")).toBe("+49621123456");
    expect(normalizeChannelValue("whatsapp", "49621123456@c.us")).toBe("+49621123456");
    expect(normalizeChannelValue("phone", "49621123456")).toBeNull();
    expect(normalizeChannelValue("phone", "0621 123456")).toBeNull();
    expect(normalizeChannelValue("whatsapp", "0621 123456", "de")).toBeNull();
  });

  it("matches phone and WhatsApp identities by one phone channel class", () => {
    expect(channelClass("phone")).toBe("phone");
    expect(channelClass("whatsapp")).toBe("phone");
    expect(messagingProviderFor("phone")).toBe("whatsapp");
    expect(messagingProviderFor("linkedin")).toBe("linkedin");
  });

  it("groups channels as email, phone and social", () => {
    expect(channelGroup("google", "person@example.test")).toBe("email");
    expect(channelGroup("phone", "+49621123456")).toBe("phone");
    expect(channelGroup("whatsapp", "+49621123456")).toBe("phone");
    expect(channelGroup("whatsapp", "123456789012345@lid")).toBe("social");
    expect(channelGroup("telegram", "person")).toBe("social");
    expect(
      byChannelGroup([
        { provider: "linkedin", value: "person" },
        { provider: "phone", value: "+49621123456" },
        { provider: "mail", value: "person@example.test" },
        { provider: "whatsapp", value: "+4915112345678" },
      ] as const),
    ).toEqual([
      { provider: "mail", value: "person@example.test" },
      { provider: "phone", value: "+49621123456" },
      { provider: "whatsapp", value: "+4915112345678" },
      { provider: "linkedin", value: "person" },
    ]);
  });
});
