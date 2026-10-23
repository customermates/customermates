import { describe, expect, it, vi } from "vitest";

import { synchronizeKnownAvatars } from "../known-avatar";

describe("synchronizeKnownAvatars", () => {
  it("applies the latest known participant picture of each saved channel", async () => {
    const synchronize = vi.fn().mockResolvedValue(undefined);
    const avatars = vi.fn(() => ({ synchronize }));
    const pictures = {
      findLatestParticipantPictureUnscoped: vi.fn((_companyId: string, provider: string) =>
        Promise.resolve(provider === "linkedin" ? "https://example.test/ada.png" : null),
      ),
    };
    await synchronizeKnownAvatars(avatars, pictures, "company-1", [
      { provider: "linkedin", value: "ada-lovelace", messagingId: "ACoAA1" },
      { provider: "google", value: " Ada@Example.test " },
    ]);
    expect(pictures.findLatestParticipantPictureUnscoped).toHaveBeenCalledWith(
      "company-1",
      "linkedin",
      "ada-lovelace",
      "ACoAA1",
    );
    expect(pictures.findLatestParticipantPictureUnscoped).toHaveBeenCalledWith(
      "company-1",
      "google",
      "ada@example.test",
      null,
    );
    expect(synchronize).toHaveBeenCalledTimes(1);
    expect(synchronize).toHaveBeenCalledWith("linkedin", "ada-lovelace", "https://example.test/ada.png");
  });
});
