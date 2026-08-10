import { describe, expect, it } from "vitest";

import deMessages from "@/i18n/locales/de.json";

const INFORMAL_RECIPIENT_EMAIL_NAMESPACES = [
  "AccountsRemovedNotice",
  "CompanyInvite",
  "ResetPassword",
  "SubscriptionInactivationNotice",
  "TrialExpiredOffer",
  "TrialInactivationNotice",
  "TrialInactivationReminder",
  "TrialWelcome",
  "VerifyEmail",
] as const;

const FORMAL_ADDRESS = /\b(?:Sie|Ihnen|Ihr(?:e|en|em|er|es)?)\b/u;

describe("German recipient-email voice", () => {
  it.each(INFORMAL_RECIPIENT_EMAIL_NAMESPACES)("uses the product's informal voice in %s", (namespace) => {
    expect(JSON.stringify(deMessages[namespace])).not.toMatch(FORMAL_ADDRESS);
  });

  it("keeps legal notices as the explicit formal-register exception", () => {
    expect(JSON.stringify(deMessages.LegalDocumentNotice)).toMatch(FORMAL_ADDRESS);
  });
});
