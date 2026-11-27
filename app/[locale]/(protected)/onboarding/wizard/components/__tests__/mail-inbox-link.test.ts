import { describe, expect, it } from "vitest";

import { mailInboxFor } from "../mail-inbox-link";

describe("mailInboxFor", () => {
  it("knows the common webmail inboxes regardless of case", () => {
    expect(mailInboxFor("anna@gmail.com")).toEqual({ name: "Gmail", url: "https://mail.google.com/mail/u/0/#inbox" });
    expect(mailInboxFor("Anna@GoogleMail.com")?.name).toBe("Gmail");
    expect(mailInboxFor("anna@hotmail.de")?.name).toBe("Outlook");
    expect(mailInboxFor("anna@gmx.net")?.name).toBe("GMX");
    expect(mailInboxFor("anna@web.de")?.name).toBe("WEB.DE");
  });

  it("offers no inbox link for a company domain", () => {
    expect(mailInboxFor("anna@acme.de")).toBeNull();
  });
});
