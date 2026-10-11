import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

import { AUTHORABLE_AI_CLIENT_IDENTITIES } from "@/components/ai-connection/ai-client-identities";
import {
  DEMO_VISUAL_PEOPLE,
  DEMO_VISUAL_PROVIDER_PERSON_PAIRINGS,
} from "@/components/marketing/visuals/demo-visual-catalog";
import {
  APPROVED_NATIVE_VISUAL_ASSETS,
  VISUAL_AGENT_PROVIDER_FIXTURES,
  VISUAL_AUTOMATION_PROVIDER_FIXTURES,
  VISUAL_CONVERSATION_FIXTURES,
  VISUAL_PERSON_FIXTURES,
  VISUAL_PROVIDER_SET_FIXTURES,
  VISUAL_RECORD_FIXTURES,
  VISUAL_STATUS_FIXTURES,
  getNativeVisualFixtureCatalog,
  listVisualPeople,
  listVisualRecords,
} from "@/components/marketing/visuals/native-fixtures";
import {
  NativeAgentProviderIdentity,
  NativeAutomationProviderIdentity,
  NativeRecordIdentity,
} from "@/components/marketing/visuals/native-visual-primitives";
import { CONTENT_LOCALES } from "@/i18n/locale-registry";
import { CONNECT_CHANNELS } from "@/ee/messaging/connect/connect-channels";
import { SYNTHETIC_CONTACT_AVATAR_URLS } from "@/prisma/seeds/avatars";
import { SYNTHETIC_CONTACT_NAMES } from "@/prisma/seeds/contacts";
import { SYNTHETIC_COMPANY_MEMBER_DEFINITIONS } from "@/prisma/seeds/members";
import { people, threads } from "@/prisma/seeds/messaging/fixtures";

function localAsset(url: string) {
  return new URL(url).pathname;
}

function idFromAsset(asset: string) {
  return basename(asset, ".png");
}

function sorted<T>(values: readonly T[]) {
  return [...values].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
}

function objectKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(objectKeys);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => [
    key,
    ...objectKeys(child),
  ]);
}

describe("marketing visual fixture catalog", () => {
  it("offers only approved leaf AI identities and renders Cursor through the native logo primitive", () => {
    expect(Object.keys(AUTHORABLE_AI_CLIENT_IDENTITIES)).toEqual([
      "chatgpt",
      "claude",
      "cursor",
      "gemini",
      "grok",
    ]);
    expect(VISUAL_AGENT_PROVIDER_FIXTURES).toBe(
      AUTHORABLE_AI_CLIENT_IDENTITIES,
    );
    expect(AUTHORABLE_AI_CLIENT_IDENTITIES).not.toHaveProperty("openai");
    expect(AUTHORABLE_AI_CLIENT_IDENTITIES).not.toHaveProperty("codex");

    for (const [provider, fixture] of Object.entries(
      AUTHORABLE_AI_CLIENT_IDENTITIES,
    )) {
      const markup = renderToStaticMarkup(
        createElement(NativeAgentProviderIdentity, {
          provider: provider as keyof typeof AUTHORABLE_AI_CLIENT_IDENTITIES,
        }),
      );
      expect(markup).toContain(`data-native-agent-provider="${provider}"`);
      expect(markup).toContain(fixture.name);
    }

    const cursor = renderToStaticMarkup(
      createElement(NativeAgentProviderIdentity, { provider: "cursor" }),
    );
    expect(cursor).toContain('viewBox="0 0 466.73 532.09"');
  });

  it("keeps n8n as an approved automation identity rather than an AI-client substitute", () => {
    expect(VISUAL_AUTOMATION_PROVIDER_FIXTURES).toEqual({
      n8n: {
        asset: "/icons/integrations/n8n.svg",
        name: "n8n",
      },
    });

    const n8n = renderToStaticMarkup(
      createElement(NativeAutomationProviderIdentity, {
        descriptor: "Automations",
        provider: "n8n",
      }),
    );
    expect(n8n).toContain('data-native-automation-provider="n8n"');
    expect(n8n).toContain("Automations");
    expect(n8n).toContain("/icons/integrations/n8n.svg");
    expect(AUTHORABLE_AI_CLIENT_IDENTITIES).not.toHaveProperty("n8n");
  });

  it("projects all safe demo people without exposing private seed fields", () => {
    const contacts = Object.values(DEMO_VISUAL_PEOPLE).filter(({ roles }) =>
      (roles as readonly string[]).includes("contact"),
    );
    const members = Object.values(DEMO_VISUAL_PEOPLE).filter(({ roles }) =>
      (roles as readonly string[]).includes("member"),
    );
    const messagingParticipants = Object.values(DEMO_VISUAL_PEOPLE).filter(({ roles }) =>
      (roles as readonly string[]).includes("messaging-participant"),
    );
    const sourceContacts = SYNTHETIC_CONTACT_NAMES.map(
      ([firstName, lastName], index) => ({
        asset: localAsset(SYNTHETIC_CONTACT_AVATAR_URLS[index]),
        name: `${firstName} ${lastName}`,
      }),
    );
    const sourceMembers = SYNTHETIC_COMPANY_MEMBER_DEFINITIONS.map(
      ({ avatarPath, firstName, lastName }) => ({
        asset: localAsset(avatarPath),
        name: `${firstName} ${lastName}`,
      }),
    );
    // Only participants with an approved photo appear in marketing visuals; the candidate has none.
    const sourceMessagingParticipants = [
      ...new Set(threads.flatMap(({ participants }) => participants)),
    ].flatMap((key) => {
      const { avatarPath, displayName } = people[key];
      return avatarPath ? [{ asset: localAsset(avatarPath), name: displayName }] : [];
    });

    expect(Object.keys(DEMO_VISUAL_PEOPLE)).toHaveLength(35);
    expect(contacts).toHaveLength(28);
    expect(members).toHaveLength(7);
    expect(
      sorted(contacts.map(({ asset, name }) => ({ asset, name }))),
    ).toEqual(sorted(sourceContacts));
    expect(sorted(members.map(({ asset, name }) => ({ asset, name })))).toEqual(
      sorted(sourceMembers),
    );
    expect(
      sorted(messagingParticipants.map(({ asset, name }) => ({ asset, name }))),
    ).toEqual(sorted(sourceMessagingParticipants));
    expect(VISUAL_PERSON_FIXTURES).toBe(DEMO_VISUAL_PEOPLE);

    const catalog = getNativeVisualFixtureCatalog();
    const forbiddenKeys = new Set([
      "email",
      "phone",
      "profileUrl",
      "occupation",
      "password",
      "messages",
      "company",
    ]);
    expect(objectKeys(catalog).filter((key) => forbiddenKeys.has(key))).toEqual(
      [],
    );
    expect(JSON.stringify(catalog)).not.toMatch(/https?:\/\/|@/u);

    const projectionSource = readFileSync(
      join(REPO_ROOT, "components/marketing/visuals/demo-visual-catalog.ts"),
      "utf8",
    );
    expect(projectionSource).not.toMatch(/^import\s/mu);
  });

  it("derives every safe channel-person pairing from seeded messaging participants", () => {
    const providerIds = {
      google: "gmail",
      instagram: "instagram",
      linkedin: "linkedin",
      outlook: "outlook",
      telegram: "telegram",
      whatsapp: "whatsapp",
    } as const;
    const sourcePairings = new Set<string>();
    for (const thread of threads) {
      for (const person of thread.participants) {
        const avatarPath = people[person].avatarPath;
        if (!avatarPath) continue;
        sourcePairings.add(
          `${providerIds[thread.account]}:${idFromAsset(localAsset(avatarPath))}`,
        );
      }
    }
    const projectedPairings = Object.entries(
      DEMO_VISUAL_PROVIDER_PERSON_PAIRINGS,
    ).flatMap(([provider, personIds]) =>
      personIds.map((person) => `${provider}:${person}`),
    );

    expect(sorted(projectedPairings)).toEqual(sorted([...sourcePairings]));
    expect(listVisualPeople({ provider: "gmail" }).map(({ id }) => id)).toEqual(
      ["amin-hassan", "anna-mueller", "clara-neumann", "yasmin-farouk"],
    );
    expect(
      listVisualPeople({ provider: "gmail", role: "contact" }).map(
        ({ id }) => id,
      ),
    ).toEqual(["amin-hassan", "anna-mueller", "yasmin-farouk"]);
    expect(
      listVisualPeople({ provider: "instagram" }).map(({ id }) => id),
    ).toEqual(["yasmin-farouk"]);
    expect(
      listVisualPeople({ provider: "outlook" }).map(({ id }) => id),
    ).toEqual(["amin-hassan"]);
    expect(
      listVisualPeople({ provider: "telegram" }).map(({ id }) => id),
    ).toEqual(["jonas-weber"]);
  });

  it("keeps the unified-inbox provider set and highlighted conversation tied to product authorities", () => {
    const supportedProviders = new Set(
      Object.values(CONNECT_CHANNELS).flatMap(({ providers }) =>
        providers.map((provider) =>
          provider === "google" ? "gmail" : provider,
        ),
      ),
    );
    const annaThread = threads.find(
      (thread) =>
        thread.account === "google" &&
        thread.participants.length === 1 &&
        thread.participants[0] === "anna",
    );

    expect(
      sorted(VISUAL_PROVIDER_SET_FIXTURES["unified-inbox"].providers),
    ).toEqual(sorted([...supportedProviders]));
    expect(annaThread).toBeDefined();
    expect(
      VISUAL_CONVERSATION_FIXTURES["gmail-rollout-next-steps"],
    ).toMatchObject({
      person: "anna-mueller",
      provider: "gmail",
      state: annaThread?.state,
      subject: "Next steps for the rollout",
    });
    expect(
      VISUAL_CONVERSATION_FIXTURES["gmail-rollout-next-steps"].localizedSubject,
    ).toEqual({
      de: "Nächste Schritte für den Rollout",
      en: "Next steps for the rollout",
    });
  });

  // The marketing deals are a curated story of their own; the Northwind demo seed no longer projects them.
  it("keeps every marketing deal consistent with its Status weight and assignment", () => {
    for (const record of Object.values(VISUAL_RECORD_FIXTURES)) {
      const status = VISUAL_STATUS_FIXTURES[record.status];
      expect(record).toMatchObject({ assignee: "max-bergmann", currency: "EUR", kind: "deal" });
      expect(record.weightedValue).toBe((record.totalValue * status.weight) / 100);
    }

    expect(
      Object.values(VISUAL_STATUS_FIXTURES).map(({ label, weight }) => [
        label,
        weight,
      ]),
    ).toEqual([
      ["Open", 30],
      ["Won", 100],
      ["Lost", 0],
      ["Abandoned", 0],
    ]);
    expect(listVisualRecords({ status: "deal-won" })).toHaveLength(4);
    expect(listVisualRecords({ assignee: "sofia-rossi" })).toEqual([]);
    expect(
      VISUAL_RECORD_FIXTURES["deal-digital-customer-platform"],
    ).toMatchObject({ projectPeriod: ["2026-06-01", "2026-08-28"], totalQuantity: 162 });
    expect(
      VISUAL_RECORD_FIXTURES["deal-digital-customer-platform"],
    ).not.toHaveProperty("organization");
  });

  it("names every demo deal in each content locale, keeping the seeded English name", () => {
    for (const [id, record] of Object.entries(VISUAL_RECORD_FIXTURES)) {
      expect(Object.keys(record.localizedName).sort(), id).toEqual([...CONTENT_LOCALES].sort());
      expect(record.localizedName.en, id).toBe(record.name);
      expect(record.localizedName.de, id).not.toBe(record.name);
    }

    const german = renderToStaticMarkup(
      createElement(NativeRecordIdentity, { locale: "de", record: "deal-digital-customer-platform" }),
    );
    expect(german).toContain("Digitale Kundenplattform");
    expect(german).toContain("Offen");
    expect(german).not.toContain("Digital Customer Platform");
  });

  it("keeps the authoring catalog deterministic, local, complete and executable", () => {
    const first = `${JSON.stringify(getNativeVisualFixtureCatalog(), null, 2)}\n`;
    const second = `${JSON.stringify(getNativeVisualFixtureCatalog(), null, 2)}\n`;
    const scriptPath = join(
      REPO_ROOT,
      "scripts/list-marketing-visual-fixtures.ts",
    );
    const output = execFileSync(
      process.execPath,
      ["--import", "tsx", scriptPath],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
      },
    );
    const packageJson = JSON.parse(
      readFileSync(join(REPO_ROOT, "package.json"), "utf8"),
    ) as {
      scripts: Record<string, string>;
    };

    expect(first).toBe(second);
    expect(output).toBe(first);
    expect(packageJson.scripts["marketing:visual-catalog"]).toBe(
      "tsx scripts/list-marketing-visual-fixtures.ts",
    );
    expect(readFileSync(scriptPath, "utf8")).not.toMatch(
      /fetch\s*\(|writeFile|openai|anthropic|replicate/u,
    );
    for (const asset of APPROVED_NATIVE_VISUAL_ASSETS) {
      expect(existsSync(join(REPO_ROOT, "public", asset))).toBe(true);
    }
  });
});
