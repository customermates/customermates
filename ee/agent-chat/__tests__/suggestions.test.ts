import { describe, it, expect, vi } from "vitest";
import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);

import { SUGGESTION_PAGE_IDS, suggestionPageId, suggestionVariant, type AgentDataCounts } from "../agent-chat.schema";
import { agentPageActions, agentPageState } from "../agent-page-actions";
import { APP_LOCALES } from "@/i18n/locale-registry";
import { createTranslator } from "next-intl";

import de from "@/i18n/locales/de.json";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import fr from "@/i18n/locales/fr.json";
import itIT from "@/i18n/locales/it.json";

const CATALOGS = { de, en, es, fr, it: itIT } as const;
const translatorFor = (locale: keyof typeof CATALOGS) => {
  const translate = createTranslator({ locale, messages: CATALOGS[locale] });
  return (key: string, values?: Record<string, string | number>) =>
    (translate as unknown as (key: string, values?: Record<string, string | number>) => string)(key, values);
};

const NO_DATA: AgentDataCounts = {
  contacts: false,
  organizations: false,
  deals: false,
  services: false,
  tasks: false,
  connectedAccounts: false,
};

describe("suggestionPageId", () => {
  it("maps entity list routes to their page id", () => {
    expect(suggestionPageId("/contacts")).toBe("contacts");
    expect(suggestionPageId("/deals")).toBe("deals");
    expect(suggestionPageId("/inbox")).toBe("inbox");
    expect(suggestionPageId("/dashboard")).toBe("dashboard");
  });

  it("maps the connected-accounts profile page despite the profile prefix", () => {
    expect(suggestionPageId("/profile/connected-accounts")).toBe("connected-accounts");
  });

  it("falls back to default for unknown routes, detail pages under other segments, and the literal default segment", () => {
    expect(suggestionPageId("/")).toBe("default");
    expect(suggestionPageId("/settings")).toBe("default");
    expect(suggestionPageId("/profile")).toBe("default");
    expect(suggestionPageId("/default")).toBe("default");
  });

  it("keys detail pages by their entity segment", () => {
    expect(suggestionPageId("/contacts/123")).toBe("contacts");
  });
});

describe("suggestionVariant", () => {
  it("uses the page's own entity signal", () => {
    expect(suggestionVariant("contacts", { ...NO_DATA, contacts: true })).toBe("data");
    expect(suggestionVariant("contacts", { ...NO_DATA, deals: true })).toBe("empty");
    expect(suggestionVariant("tasks", { ...NO_DATA, tasks: true })).toBe("data");
  });

  it("uses the connected-accounts signal for inbox and connected-accounts", () => {
    expect(suggestionVariant("inbox", { ...NO_DATA, connectedAccounts: true })).toBe("data");
    expect(suggestionVariant("inbox", { ...NO_DATA, contacts: true })).toBe("empty");
    expect(suggestionVariant("connected-accounts", { ...NO_DATA, connectedAccounts: true })).toBe("data");
  });

  it("uses contacts or deals for dashboard and default", () => {
    expect(suggestionVariant("dashboard", { ...NO_DATA, deals: true })).toBe("data");
    expect(suggestionVariant("default", { ...NO_DATA, contacts: true })).toBe("data");
    expect(suggestionVariant("default", NO_DATA)).toBe("empty");
  });
});

describe("suggestion catalogs", () => {
  it.each(APP_LOCALES)("%s catalog returns exactly three usable actions for every page and state", (locale) => {
    for (const pageId of SUGGESTION_PAGE_IDS) {
      for (const state of ["data", "empty"] as const) {
        const actions = agentPageActions(pageId, state, translatorFor(locale), locale);

        expect(actions, `${pageId}.${state}`).toHaveLength(3);
        for (const action of actions) {
          expect(action.label.length, `${pageId}.${state}.label`).toBeGreaterThan(0);
          expect(action.prompt.length, `${pageId}.${state}.prompt`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("derives the same page state the legacy variant helper reported", () => {
    const counts: AgentDataCounts = { ...NO_DATA, contacts: true, connectedAccounts: true };

    for (const pageId of SUGGESTION_PAGE_IDS) {
      expect(agentPageState(pageId, counts), pageId).toBe(suggestionVariant(pageId, counts));
      expect(agentPageState(pageId, NO_DATA), pageId).toBe(suggestionVariant(pageId, NO_DATA));
    }
  });
});
