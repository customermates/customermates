import { render } from "@react-email/render";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import WorkspaceRemovalNotice from "../workspace-removal-notice";
import { getEmailLayoutCopy } from "../base/email-layout-copy";

import { getTranslator } from "@/i18n/get-translator";
import { APP_LOCALES, type AppLocale } from "@/i18n/locale-registry";

const WORKSPACE = "Hoffmann Consulting";

function comparable(text: string, locale: AppLocale) {
  return text.replace(/\s+/gu, " ").replaceAll("’", "'").toLocaleLowerCase(locale);
}

async function removalNotice(locale: AppLocale) {
  const t = await getTranslator(locale);
  const element = createElement(WorkspaceRemovalNotice, {
    locale,
    layoutCopy: await getEmailLayoutCopy(locale),
    greeting: t("WorkspaceRemovalNotice.greeting", { firstName: "Nora" }),
    body: t("WorkspaceRemovalNotice.body", { workspace: WORKSPACE }),
    otherWorkspaces: t("WorkspaceRemovalNotice.otherWorkspaces"),
    cta: t("WorkspaceRemovalNotice.cta"),
    rejoin: t("WorkspaceRemovalNotice.rejoin", { workspace: WORKSPACE }),
    subject: t("WorkspaceRemovalNotice.subject", { workspace: WORKSPACE }),
    title: t("WorkspaceRemovalNotice.title"),
  });

  return {
    invitationLink: t("CompanyInviteModal.label"),
    rejoin: t("WorkspaceRemovalNotice.rejoin", { workspace: WORKSPACE }),
    text: await render(element, { plainText: true }),
  };
}

describe("WorkspaceRemovalNotice", () => {
  it.each(APP_LOCALES)("tells a removed member in %s to ask to join again with an invitation link", async (locale) => {
    const { invitationLink, rejoin, text } = await removalNotice(locale);

    expect(comparable(text, locale)).toContain(comparable(rejoin, locale));
    expect(rejoin).toContain(WORKSPACE);
    expect(comparable(rejoin, locale)).toContain(comparable(invitationLink, locale));
  });

  it("no longer asks a removed member for a new invitation", async () => {
    const { rejoin } = await removalNotice("en");

    expect(rejoin).not.toMatch(/new invitation/iu);
    expect(rejoin).toMatch(/approve/iu);
  });
});
