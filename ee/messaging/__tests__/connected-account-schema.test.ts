import { describe, expect, it } from "vitest";

import { defaultEmailSettings } from "../email-settings";
import { ConnectedAccountDtoSchema } from "../messaging.schema";

describe("ConnectedAccountDtoSchema", () => {
  it("does not expose internal signature content or settings", () => {
    const parsed = ConnectedAccountDtoSchema.parse({
      id: "00000000-0000-4000-8000-000000000001",
      provider: "google",
      status: "ok",
      hasMessaging: true,
      hasCalendar: false,
      emailAddress: "sender@example.com",
      displayName: "Sender",
      shared: true,
      syncing: false,
      lastSyncedAt: null,
      createdAt: new Date("2026-09-04T10:00:00.000Z"),
      owner: {
        userId: "00000000-0000-4000-8000-000000000002",
        firstName: "Account",
        lastName: "Owner",
        avatarUrl: null,
      },
      isOwner: false,
      folders: [],
      selectedFolderIds: [],
      foldersSyncedAt: null,
      linkedinProducts: [],
      signature: "Saved but disabled signature",
      emailSettings: defaultEmailSettings(),
      signatureHtml: "<strong>Saved but disabled signature</strong>",
    });

    expect(parsed).not.toHaveProperty("signature");
    expect(parsed).not.toHaveProperty("emailSettings");
    expect(parsed).not.toHaveProperty("signatureHtml");
  });
});
