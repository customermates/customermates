import { describe, expect, it, vi } from "vitest";

import { synchronizeInboundAvatar } from "../inbound-avatar";

describe("synchronizeInboundAvatar", () => {
  it("hands the inbound sender's picture to the company's avatar service", async () => {
    const synchronize = vi.fn().mockResolvedValue(undefined);
    const avatars = vi.fn(() => ({ synchronize }));
    await synchronizeInboundAvatar(avatars, "company-1", {
      isEcho: false,
      message: { id: "m1" },
      inboundSender: { provider: "google", identifier: "ada@example.test", pictureUrl: "https://example.test/a.png" },
    });
    expect(avatars).toHaveBeenCalledWith("company-1");
    expect(synchronize).toHaveBeenCalledWith("google", "ada@example.test", "https://example.test/a.png");
  });

  it.each([undefined, { isEcho: true }, { isEcho: false, isDuplicate: true }, { isEcho: false, message: { id: "m" } }])(
    "does nothing without an inbound sender (%o)",
    async (ingested) => {
      const avatars = vi.fn(() => ({ synchronize: vi.fn() }));
      await synchronizeInboundAvatar(avatars, "company-1", ingested);
      expect(avatars).not.toHaveBeenCalled();
    },
  );
});
