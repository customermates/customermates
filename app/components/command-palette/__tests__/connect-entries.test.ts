import { describe, expect, it } from "vitest";

import type { CommandEnvironment } from "@/components/keyboard/command-registry";
import type { PaletteTranslator } from "../palette-entries";

import messages from "@/i18n/locales/en.json";
import { Action, Resource } from "@/generated/prisma";
import { CONNECT_INTENT_AI_CLIENTS, connectedChannels, readConnectIntent } from "@/components/keyboard/connect-intent";
import { markConnectedEntries, staticEntries } from "../palette-entries";
import { rankCandidates } from "../command-palette-search";

const t: PaletteTranslator = (key) => {
  const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], messages);
  return typeof value === "string" ? value : key;
};

const everything: CommandEnvironment = {
  appMode: "cloud",
  canManageSchema: true,
  onListPage: false,
  otherWorkspaces: false,
  can: () => true,
};

function top(query: string, environment = everything) {
  const ranked = rankCandidates(query, staticEntries(t, environment), null);
  return ranked[0];
}

describe("connection entries in the search", () => {
  it("finds each channel by the provider name people type", () => {
    expect(top("google calendar")?.key).toBe("cmd:setting.channels.google");
    expect(top("microsoft")?.key).toBe("cmd:setting.channels.outlook");
    expect(top("telegram")?.key).toBe("cmd:setting.channels.telegram");
    expect(top("instagram")?.key).toBe("cmd:setting.channels.instagram");
    expect(top("sales navigator")?.key).toBe("cmd:setting.channels.linkedinSalesNavigator");
  });

  it("finds each AI client connector and opens it on the API keys and connectors page", () => {
    const entries = staticEntries(t, everything);
    expect(top("claude")?.key).toBe("cmd:setting.apiKeys.claude");
    expect(top("codex")?.key).toBe("cmd:setting.apiKeys.openai");
    expect(top("gemini")?.key).toBe("cmd:setting.apiKeys.gemini");
    const claude = entries.find((entry) => entry.key === "cmd:setting.apiKeys.claude");
    expect(claude).toMatchObject({
      label: "Connect Claude",
      subtitle: "API keys & connectors",
      run: { kind: "href", href: "/settings/api-keys?connect=claude" },
    });
    expect(entries.find((entry) => entry.key === "cmd:setting.channels.google")?.run).toEqual({
      kind: "href",
      href: "/settings/channels?connect=google",
    });
    expect(top("connectors")?.key).toMatch(/^cmd:(settings\.api-keys|setting\.apiKeys\.)/);
  });

  it("offers connections only to people who may create them", () => {
    const readOnly: CommandEnvironment = {
      ...everything,
      can: (resource, action) => action !== Action.create || resource === Resource.users,
    };
    const keys = staticEntries(t, readOnly).map((entry) => entry.key);
    expect(keys.filter((key) => key.startsWith("cmd:setting.channels."))).toEqual(["cmd:setting.channels.connect"]);
    expect(keys.some((key) => key.startsWith("cmd:setting.apiKeys."))).toBe(false);
    expect(staticEntries(t, { ...everything, appMode: "self-hosted" }).map((entry) => entry.key)).not.toContain(
      "cmd:setting.channels.google",
    );
  });

  it("reads only known connect targets from the address", () => {
    expect(readConnectIntent("connect=claude", CONNECT_INTENT_AI_CLIENTS)).toBe("claude");
    expect(readConnectIntent("connect=evil", CONNECT_INTENT_AI_CLIENTS)).toBeNull();
    expect(readConnectIntent("view=1", CONNECT_INTENT_AI_CLIENTS)).toBeNull();
  });
});

describe("forgiving search", () => {
  it("finds connections despite a typo", () => {
    expect(top("telgram")?.key).toBe("cmd:setting.channels.telegram");
    expect(top("telegarm")?.key).toBe("cmd:setting.channels.telegram");
    expect(top("outlok")?.key).toBe("cmd:setting.channels.outlook");
    expect(top("instagarm")?.key).toBe("cmd:setting.channels.instagram");
    expect(top("calender")?.key).toBe("cmd:page.calendar");
  });

  it("finds German compound words by the word they contain", async () => {
    const german = (await import("@/i18n/locales/de.json")).default;
    const de: PaletteTranslator = (key) => {
      const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], german);
      return typeof value === "string" ? value : key;
    };
    const ranked = rankCandidates("Kalenderverbindung", staticEntries(de, everything), null);
    expect(ranked.map((entry) => entry.key)).toEqual(
      expect.arrayContaining(["cmd:page.calendar", "cmd:settings.channels"]),
    );
  });

  it("finds Calendar and renamed pages under their old names", () => {
    expect(top("calendar")?.key).toBe("cmd:page.calendar");
    expect(top("planner")?.key).toBe("cmd:page.calendar");
    expect(top("data model")?.key).toBe("cmd:page.configure");
    expect(top("audit log")?.key).toBe("cmd:settings.activity");
    expect(top("deliveries")?.key).toBe("cmd:settings.webhook-deliveries");
  });
});

describe("connected channels", () => {
  it("marks only the channels the person connected themselves, LinkedIn by product", () => {
    const connected = connectedChannels([
      { provider: "google", isOwner: true },
      { provider: "linkedin", isOwner: true, linkedinProducts: ["classic", "sales_navigator"] },
      { provider: "telegram", isOwner: false },
    ]);
    expect([...connected].sort()).toEqual(["google", "linkedin", "linkedin_sales_navigator"]);
    const entries = markConnectedEntries(staticEntries(t, everything), connected, "Connected");
    const subtitle = (key: string) => entries.find((entry) => entry.key === key)?.subtitle;
    expect(subtitle("cmd:setting.channels.google")).toBe("Channels & calendars · Connected");
    expect(subtitle("cmd:setting.channels.linkedinRecruiter")).toBe("Channels & calendars");
    expect(subtitle("cmd:setting.channels.telegram")).toBe("Channels & calendars");
  });
});
