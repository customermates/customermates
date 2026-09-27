import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SendContactInquirySchema } from "@/features/contact/send-contact-inquiry.schema";
import { REGISTERED_LOCALES } from "@/i18n/locale-registry";
import { createErrorHandler } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";
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
    const rejected = SendContactInquirySchema.safeParse(
      {
        ...validInquiry,
        privacyAcknowledged: false,
      },
      {
        error: createErrorHandler({
          [CustomErrorCode.privacyAcknowledgementRequired]: "Privacy acknowledgement is required",
        }),
      },
    );

    expect(rejected.success).toBe(false);
    if (!rejected.success)
      expect(rejected.error.issues).toEqual([
        expect.objectContaining({
          code: "custom",
          message: "Privacy acknowledgement is required",
          params: { error: CustomErrorCode.privacyAcknowledgementRequired },
          path: ["privacyAcknowledged"],
        }),
      ]);
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
    const form = source("app/[locale]/(static)/contact/contact-form.tsx");
    const state = source("app/[locale]/(static)/contact/contact-form.state.ts");

    expect(form).toContain("<Checkbox");
    expect(form).toContain('id="privacyAcknowledged"');
    expect(form).toContain('t.rich("ContactPage.form.privacyAcknowledgement"');
    expect(form).toContain('t("ContactPage.form.privacyAcknowledgementRequired")');
    expect(form).toContain('href="/privacy"');
    expect(form).toContain('aria-describedby={privacyInvalid ? "privacyAcknowledged-error" : undefined}');
    expect(form).toContain('role="alert"');
    expect(source("features/contact/send-contact-inquiry.schema.ts")).not.toContain(
      "Privacy policy acknowledgement is required",
    );
    expect(state.match(/privacyAcknowledged: false/gu)).toHaveLength(1);
    expect(form).toContain("setForm(EMPTY_CONTACT_FORM)");
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
