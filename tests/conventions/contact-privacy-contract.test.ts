import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SendContactInquirySchema } from "@/features/contact/send-contact-inquiry.schema";
import { REGISTERED_LOCALES } from "@/i18n/locale-registry";
import { REPO_ROOT } from "./walk";

const validInquiry = {
  company: "Example GmbH",
  email: "founder@example.com",
  message: "I would like to understand the product workflow.",
  name: "Example Founder",
};

function source(path: string) {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

describe("contact privacy acknowledgement", () => {
  it("requires acknowledgement at the server validation boundary", () => {
    expect(
      SendContactInquirySchema.safeParse({
        ...validInquiry,
        privacyAcknowledged: false,
      }).success,
    ).toBe(false);
    expect(
      SendContactInquirySchema.safeParse({
        ...validInquiry,
        privacyAcknowledged: true,
      }).success,
    ).toBe(true);
    expect(SendContactInquirySchema.safeParse(validInquiry).success).toBe(
      false,
    );
  });

  it("renders a required acknowledgement with a localized privacy link", () => {
    const form = source("app/[locale]/(public)/contact/contact-form.tsx");
    const store = source("app/[locale]/(public)/contact/contact.store.ts");

    expect(form).toContain("<FormCheckbox");
    expect(form).toContain('id="privacyAcknowledged"');
    expect(form).toContain('t.rich("ContactPage.form.privacyAcknowledgement"');
    expect(form).toContain('t("ContactPage.form.privacyAcknowledgementRequired")');
    expect(form).toContain('href="/privacy"');
    expect(source("components/forms/form-checkbox.tsx")).toContain("aria-describedby={hasError ? errorId : undefined}");
    expect(source("components/forms/form-checkbox.tsx")).toContain('role="alert"');
    expect(source("features/contact/send-contact-inquiry.schema.ts")).not.toContain(
      "Privacy policy acknowledgement is required",
    );
    expect(store.match(/privacyAcknowledged: false/gu)).toHaveLength(3);
  });

  it("keeps the acknowledgement available in every routing locale", () => {
    for (const locale of REGISTERED_LOCALES) {
      const messages = JSON.parse(source(`i18n/locales/${locale}.json`)) as {
        ContactPage: {
          form: {
            privacyAcknowledgement?: string;
            privacyAcknowledgementRequired?: string;
          };
        };
      };
      expect(
        messages.ContactPage.form.privacyAcknowledgement,
        locale,
      ).toContain("<dataPrivacyLink>");
      expect(
        messages.ContactPage.form.privacyAcknowledgementRequired,
        locale,
      ).toBeTruthy();
    }
  });
});
