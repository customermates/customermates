import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { Action, Resource } from "@/generated/prisma";
import { CONTENT_LOCALES } from "@/i18n/locale-registry";
import { findAgentUiTarget } from "@/ee/agent-chat/ui-targets";
import { commandAvailable, STATIC_COMMANDS, staticCommand, type CommandEnvironment } from "../command-registry";
import { SHORTCUTS } from "../shortcut-registry";

const LOCALES = CONTENT_LOCALES;

const catalogs = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(readFileSync(join(process.cwd(), "i18n/locales", `${locale}.json`), "utf8")) as Record<string, unknown>,
  ]),
);

function message(locale: string, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], catalogs[locale]);
}

const everything: CommandEnvironment = {
  appMode: "cloud",
  canManageSchema: true,
  onListPage: true,
  can: () => true,
};

describe("command registry", () => {
  it("gives every command a unique stable id", () => {
    const ids = STATIC_COMMANDS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^(page|settings|setting|action)\.[a-zA-Z.-]+$/);
  });

  it("labels every command and lists synonyms in every locale", () => {
    for (const entry of STATIC_COMMANDS) {
      for (const locale of LOCALES) {
        expect(typeof message(locale, entry.labelKey), `${locale} ${entry.labelKey}`).toBe("string");
        const synonyms = message(locale, `CommandPalette.synonyms.${entry.id}`);
        expect(typeof synonyms, `${locale} synonyms ${entry.id}`).toBe("string");
        expect((synonyms as string).split(",").filter((synonym) => synonym.trim()).length).toBeGreaterThan(0);
      }
    }
  });

  it("deep links every setting to a registered control", () => {
    for (const entry of STATIC_COMMANDS) {
      if (!("control" in entry.target)) continue;
      expect(findAgentUiTarget(entry.target.control), entry.target.control).toBeDefined();
    }
  });

  it("references existing parents and shortcuts", () => {
    const shortcutIds = new Set(SHORTCUTS.map((entry) => entry.id));
    for (const entry of STATIC_COMMANDS) {
      if (entry.parentId) expect(staticCommand(entry.parentId), entry.parentId).toBeDefined();
      if (entry.shortcut) expect(shortcutIds.has(entry.shortcut)).toBe(true);
    }
  });

  it("covers every settings page and every profile preference", () => {
    const ids = STATIC_COMMANDS.map((entry) => entry.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "settings.profile",
        "settings.members",
        "settings.billing",
        "settings.webhooks",
        "settings.webhook-deliveries",
        "setting.profile.displayLanguage",
        "setting.profile.formattingLocale",
        "setting.profile.theme",
      ]),
    );
  });

  it("hides commands the person may not use", () => {
    const members = staticCommand("settings.members");
    const invite = staticCommand("action.inviteMembers");
    const configure = staticCommand("page.configure");
    const inbox = staticCommand("page.inbox");
    const switchView = staticCommand("action.switchView");
    if (!members || !invite || !configure || !inbox || !switchView) throw new Error("missing command");
    const reader: CommandEnvironment = {
      ...everything,
      canManageSchema: false,
      onListPage: false,
      can: (resource, action) => resource === Resource.users && action === Action.readOwn,
    };
    expect(commandAvailable(members, reader)).toBe(true);
    expect(commandAvailable(invite, reader)).toBe(false);
    expect(commandAvailable(configure, reader)).toBe(false);
    expect(commandAvailable(switchView, reader)).toBe(false);
    expect(commandAvailable(inbox, { ...everything, appMode: "self-hosted" })).toBe(false);
    expect(commandAvailable(configure, everything)).toBe(true);
  });
});
