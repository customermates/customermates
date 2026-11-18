import { describe, expect, it } from "vitest";

import {
  byChannelGroup,
  channelClass,
  channelGroup,
  getProviderProfileUrl,
  messagingProviderFor,
} from "@/ee/messaging/provider";
import { inferChannelProviders, normalizeChannelValue } from "../channel-value";

describe("channel values", () => {
  it("offers typed phone numbers as plain phone channels instead of WhatsApp", () => {
    expect(inferChannelProviders("+49 621 123456")).toEqual(["phone"]);
    expect(inferChannelProviders("0049 621 123456")).toEqual(["phone"]);
    expect(inferChannelProviders("0621 123456", "de")).toEqual(["phone"]);
    expect(inferChannelProviders("(201) 555-0123", "us")).toEqual(["phone"]);
    expect(inferChannelProviders("person@example.test")).toEqual(["mail"]);
    expect(inferChannelProviders("https://www.linkedin.com/in/person")).toEqual(["linkedin"]);
    expect(inferChannelProviders("@person")).toEqual(["linkedin", "telegram", "instagram", "facebook"]);
  });

  it("reads a Facebook profile from every link form Facebook and Messenger hand out", () => {
    expect(inferChannelProviders("https://www.facebook.com/jane.doe")).toEqual(["facebook"]);
    expect(inferChannelProviders("https://m.me/jane.doe")).toEqual(["facebook"]);
    expect(normalizeChannelValue("facebook", "https://www.facebook.com/jane.doe/")).toBe("jane.doe");
    expect(normalizeChannelValue("facebook", "https://m.facebook.com/jane.doe?ref=bookmarks")).toBe("jane.doe");
    expect(normalizeChannelValue("facebook", "https://www.facebook.com/profile.php?id=100001234567890&sk=about")).toBe(
      "100001234567890",
    );
    expect(normalizeChannelValue("facebook", "https://www.facebook.com/people/Jane-Doe/100001234567890/")).toBe(
      "100001234567890",
    );
    expect(normalizeChannelValue("facebook", "https://www.messenger.com/t/100001234567890")).toBe("100001234567890");
    expect(normalizeChannelValue("facebook", "https://www.facebook.com/messages/t/100001234567890")).toBe(
      "100001234567890",
    );
    expect(normalizeChannelValue("facebook", "https://m.me/jane.doe")).toBe("jane.doe");
    expect(normalizeChannelValue("facebook", "@jane.doe")).toBe("jane.doe");
    expect(getProviderProfileUrl("facebook", "jane.doe")).toBe("https://www.facebook.com/jane.doe");
    expect(getProviderProfileUrl("facebook", "100001234567890")).toBe(
      "https://www.facebook.com/profile.php?id=100001234567890",
    );
    expect(channelGroup("facebook", "jane.doe")).toBe("social");
    expect(normalizeChannelValue("facebook", "https://www.messenger.com/e2ee/t/100001234567890")).toBe(
      "100001234567890",
    );
    expect(normalizeChannelValue("facebook", "https://www.facebook.com/profile.php?sk=about&id=100001234567890")).toBe(
      "100001234567890",
    );
  });

  it.each([
    "https://www.facebook.com/groups/1234567890",
    "https://www.facebook.com/share/p/abc123",
    "https://www.facebook.com/pages/Example/1234567890",
    "https://www.facebook.com/watch/?v=1234567890",
    "https://www.facebook.com/profile.php",
    "https://www.facebook.com/events/1234567890",
    "https://www.custom.me/jane",
    "https://notfb.com/jane",
    "https://notfacebook.com/jane",
  ])("does not read a Facebook profile out of %s", (value) => {
    expect(inferChannelProviders(value)).not.toContain("facebook");
    expect(normalizeChannelValue("facebook", value)).toBeNull();
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
