import type { ContentLocale } from "@/i18n/locale-registry";
import { AsyncLocalStorage } from "node:async_hooks";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UnifiedDocsDeps } from "../docs-unified-search";
import {
  createLiveDocsRetrievalContracts,
  liveDocsRetrievalContractsEnabled,
} from "@/tests/helpers/live-docs-retrieval-contracts";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { docsCorpus } from "../docs-corpus";
import { unifiedDocsPageResult, unifiedDocsSearchResult, type DocsSearchHit, searchDocsTool } from "../docs.mcp-tools";
import { PrismaDocsChunkRepo } from "../prisma-docs-chunk.repository";
import { mcpToolResultText, type McpToolResult } from "../mcp-tool";

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

const PAGE_LINK_QUESTIONS: [ContentLocale, string, string][] = [
  ["en", "roles page URL", "/company/roles"],
  ["en", "link to the roles page", "/company/roles"],
  ["en", "link to the subscription page", "/company/subscription"],
  ["en", "webhooks page URL", "/company/webhooks"],
  ["en", "API keys page URL", "/profile/api-keys"],
  ["en", "routines page URL", "/routines"],
  ["en", "URL of the routines page", "/routines"],
  ["en", "contacts page URL", "/contacts"],
  ["en", "link to the deals page", "/deals"],
  ["en", "tasks page URL", "/tasks"],
  ["en", "organizations page URL", "/organizations"],
  ["en", "link to the services page", "/services"],
  ["de", "URL der Rollen-Seite", "/company/roles"],
  ["de", "URL der Webhooks-Seite", "/company/webhooks"],
  ["de", "URL der API-Keys-Seite", "/profile/api-keys"],
  ["de", "Link zur Routinen-Seite", "/routines"],
  ["de", "URL der Kontakte-Seite", "/contacts"],
  ["de", "Link zur Aufgaben-Seite", "/tasks"],
  ["de", "URL der Organisationen-Seite", "/organizations"],
  ["de", "URL der Services-Seite", "/services"],
  ["en", "webhooks route", "/company/webhooks"],
  ["de", "Route Webhooks", "/company/webhooks"],
  ["de", "URL der Unternehmenseinstellungen-Seite", "/company/settings"],
  ["de", "Link zur Unternehmenseinstellungen-Seite", "/company/settings"],
  ["de", "URL der Profileinstellungen-Seite", "/profile/settings"],
  ["de", "Link zur Profileinstellungen-Seite", "/profile/settings"],
  ["de", "URL der Abonnement-Seite", "/company/subscription"],
];

const SECTION_QUESTIONS: [ContentLocale, string, string, string | null][] = [
  ["en", "how do I create a webhook", "webhooks#how-do-i-create-a-webhook", "/company/webhooks"],
  ["en", "create a webhook", "webhooks#how-do-i-create-a-webhook", "/company/webhooks"],
  ["en", "how do I add a webhook", "webhooks#how-do-i-create-a-webhook", "/company/webhooks"],
  ["de", "Wie lege ich einen Webhook an", "webhooks#how-do-i-create-a-webhook", "/company/webhooks"],
  ["de", "Wie füge ich einen Webhook hinzu", "webhooks#how-do-i-create-a-webhook", "/company/webhooks"],
  ["de", "Wo trage ich die Webhook-URL ein", "webhooks#how-do-i-create-a-webhook", "/company/webhooks"],
  ["de", "Webhook pausieren ohne ihn zu löschen", "webhooks#how-do-i-create-a-webhook", "/company/webhooks"],
  ["en", "webhooks route", "app-company#webhooks-tab", "/company/webhooks"],
  ["de", "Route Webhooks", "app-company#webhooks-tab", "/company/webhooks"],
  ["en", "list_records page size", "mcp#records", null],
  ["en", "who can create API keys", "api-keys#who-can-create-and-see-api-keys", "/profile/api-keys"],
  ["en", "how long do quick connection keys last", "api-keys#do-keys-expire", "/profile/api-keys"],
  ["en", "API key name length", "api-keys#what-is-the-key-format", "/profile/api-keys"],
  ["en", "who can see webhook secrets", "webhooks#who-can-see-and-change-webhooks", "/company/webhooks"],
  ["en", "how do I debug a webhook delivery", "webhooks#how-do-i-debug-a-delivery", "/company/webhook-deliveries"],
  ["de", "Laufen API-Keys ab", "api-keys#do-keys-expire", "/profile/api-keys"],
  ["de", "Wie lang darf ein Key-Name sein", "api-keys#what-is-the-key-format", "/profile/api-keys"],
  ["de", "Wer kann Webhooks sehen und ändern", "webhooks#who-can-see-and-change-webhooks", "/company/webhooks"],
  ["de", "Wie debugge ich eine Delivery", "webhooks#how-do-i-debug-a-delivery", "/company/webhook-deliveries"],
  ["en", "where do I add a new contact", "app-records#how-do-i-add-a-record", "/contacts"],
  ["en", "where do I see a list of all tasks", "app-records#how-do-i-add-a-record", "/tasks"],
  ["en", "where do I see my services", "app-records#how-do-i-add-a-record", "/services"],
  ["de", "Kontakt anlegen", "app-records#how-do-i-add-a-record", "/contacts"],
  ["de", "Wo lege ich einen neuen Deal an", "app-records#how-do-i-add-a-record", "/deals"],
  ["en", "where do I create a routine", "app-routines#how-do-i-create-a-routine", "/routines"],
  ["de", "Wo lege ich eine Routine an", "app-routines#how-do-i-create-a-routine", "/routines"],
  [
    "en",
    "where do I rename the Deals record type",
    "app-company#how-do-i-rename-record-types-in-the-data-model",
    "/company/settings",
  ],
  [
    "de",
    "Wo benenne ich den Datensatztyp Deals um?",
    "app-company#how-do-i-rename-record-types-in-the-data-model",
    "/company/settings",
  ],
  ["en", "where do I see who changed what in the workspace", "app-company#audit-logs-tab", "/company/audit-logs"],
  [
    "en",
    "Where do I resend the verification email?",
    "app-profile#how-do-i-verify-my-email-address",
    "/profile/settings",
  ],
  ["en", "resend verification email", "app-profile#how-do-i-verify-my-email-address", "/profile/settings"],
  [
    "en",
    "Where is the Resend verification email button?",
    "app-profile#how-do-i-verify-my-email-address",
    "/profile/settings",
  ],
  ["de", "Bestätigungs-E-Mail erneut senden", "app-profile#how-do-i-verify-my-email-address", "/profile/settings"],
  [
    "de",
    "Wo sende ich die Verifizierungs-E-Mail erneut?",
    "app-profile#how-do-i-verify-my-email-address",
    "/profile/settings",
  ],
  ["en", "set up email with resend", "self-hosting#how-do-i-set-up-email-with-resend-and-can-i-use-smtp", null],
  ["de", "Wo lade ich Mitglieder ein?", "app-company#how-do-invitations-work", "/company/members"],
  ["de", "Wie lade ich Mitglieder ein?", "app-company#how-do-invitations-work", "/company/members"],
  [
    "de",
    "Wie entferne ich ein Mitglied",
    "app-company#how-do-i-approve-deactivate-or-edit-a-member",
    "/company/members",
  ],
  ["de", "Mitglied löschen", "app-company#how-do-i-approve-deactivate-or-edit-a-member", "/company/members"],
  ["en", "how do I remove a member", "app-company#how-do-i-approve-deactivate-or-edit-a-member", "/company/members"],
  [
    "en",
    "remove a user from my workspace",
    "app-company#how-do-i-approve-deactivate-or-edit-a-member",
    "/company/members",
  ],
  ["en", "how do I add a new column", "concepts#how-do-i-add-change-or-delete-a-custom-column", null],
  ["de", "URL der Unternehmenseinstellungen-Seite", "app-company#settings-tab", "/company/settings"],
  ["de", "URL der Abonnement-Seite", "app-company#subscription-tab", "/company/subscription"],
  ["en", "link to the members page", "app-company#members-tab", "/company/members"],
  ["en", "link to the roles page", "app-company#roles-tab", "/company/roles"],
  ["en", "link to the subscription page", "app-company#subscription-tab", "/company/subscription"],
  ["en", "link to billing", "app-company#subscription-tab", "/company/subscription"],
  ["en", "link to company settings", "app-company#settings-tab", "/company/settings"],
  ["en", "link to the audit logs", "app-company#audit-logs-tab", "/company/audit-logs"],
  ["en", "link to the inbox", "app-inbox#what-is-the-inbox", "/inbox"],
  ["en", "link to my profile settings", "app-profile#settings-tab", "/profile/settings"],
  ["en", "link to the routines page", "app-routines#which-ids-does-the-page-have", "/routines"],
  ["en", "link to the onboarding wizard", "app-onboarding#what-are-the-three-steps", "/onboarding/wizard"],
  ["en", "link to the API keys page", "api-keys#how-do-i-create-an-api-key", "/profile/api-keys"],
  ["en", "Where is the Recent Deliveries page?", "app-company#deliveries-tab", "/company/webhook-deliveries"],
  ["en", "Who can manage billing?", "app-company#who-can-manage-billing", "/company/subscription"],
  [
    "en",
    "Where do I set stage probabilities?",
    "app-company#how-do-stage-probabilities-and-totals-work",
    "/company/settings",
  ],
  [
    "en",
    "What happens to my connected accounts if we switch to Starter?",
    "app-company#what-happens-to-connected-accounts-when-the-plan-changes",
    "/company/subscription",
  ],
  ["en", "create a custom role", "app-company#how-does-the-role-editor-work", "/company/roles"],
  [
    "en",
    "Can I name contacts anything I want?",
    "app-company#how-do-i-rename-record-types-in-the-data-model",
    "/company/settings",
  ],
  [
    "en",
    "trial ended and I'm locked out",
    "app-company#what-happens-when-the-trial-ends-or-a-payment-fails",
    "/subscription-expired",
  ],
  ["en", "Can I scope an API key to read-only?", "api-keys#what-permissions-does-a-key-have", null],
  ["en", "Which header does the API key go in?", "api-keys#how-do-i-use-a-key", null],
  ["en", "How do I create an automation?", "app-routines#how-do-i-create-a-routine", "/routines"],
  ["en", "trigger an automation when a deal changes", "app-routines#how-do-event-triggers-work", "/routines"],
  ["en", "Can Mate click buttons for me?", "app-assistant#how-does-mate-operate-the-interface", null],
  ["en", "Can Mate search the web?", "app-assistant#reading-web-pages", null],
  ["en", "Can Mate read a web page I send it?", "app-assistant#reading-web-pages", null],
  ["de", "Kann Mate im Web suchen?", "app-assistant#reading-web-pages", null],
  ["en", "Can a contact belong to several companies?", "concepts#how-do-relationships-link-records", null],
  ["en", "Are notes markdown?", "concepts#what-are-notes", null],
  ["en", "How is a deal's total value calculated?", "concepts#how-is-a-deals-total-value-calculated", null],
  ["en", "What does Assigned read access mean?", "concepts#who-are-users-roles-and-the-company", null],
  ["en", "Which custom field types are there?", "concepts#what-are-custom-columns", null],
  ["en", "show my pipeline as a kanban board", "app-records#how-do-i-switch-between-table-and-board-view", "/deals"],
  [
    "en",
    "How do I set up pipeline stages?",
    "app-records#how-do-i-change-a-deal-stage-or-a-task-status-on-the-board",
    "/deals",
  ],
  [
    "en",
    "Can I edit an existing record in the add drawer?",
    "app-records#what-is-the-shared-layout-of-a-record-type",
    "/contacts",
  ],
  [
    "en",
    "change the font of my outgoing emails",
    "app-profile#email-appearance-and-signature",
    "/profile/connected-accounts",
  ],
  ["en", "make a channel visible to teammates", "app-profile#private-or-shared", "/profile/connected-accounts"],
  ["en", "change my password", "app-profile#what-can-i-not-change-here", "/profile/settings"],
  ["en", "Why is the inbox locked on Starter?", "app-inbox#who-can-use-the-inbox", "/inbox"],
  [
    "en",
    "Can an admin read my private conversations?",
    "app-inbox#which-conversations-do-i-see",
    "/profile/connected-accounts",
  ],
  ["en", "write a new email to a contact", "app-inbox#how-do-i-start-a-new-conversation", "/contacts/<id>"],
  ["en", "Is there a calendar in Customermates?", "app-dashboard#what-can-an-activity-timeline-show", "/dashboard"],
  ["en", "share a dashboard widget with my team", "app-dashboard#what-does-the-dashboard-show", "/dashboard"],
  ["en", "Which chart types can a widget show?", "app-dashboard#which-widget-types-exist", "/dashboard"],
  ["en", "Can I skip onboarding?", "app-onboarding#can-i-skip-parts-of-the-onboarding", "/onboarding/wizard"],
  ["en", "Can I search contacts by email address?", "app-search#what-does-global-search-find", null],
  ["en", "Should I use searchTerm or a filter?", "filter-syntax#free-text-search-or-a-filter", null],
  ["de", "Link zur Mitglieder-Seite", "app-company#members-tab", "/company/members"],
  ["de", "Link zu den Unternehmenseinstellungen", "app-company#settings-tab", "/company/settings"],
  ["de", "Link zum Audit-Log", "app-company#audit-logs-tab", "/company/audit-logs"],
  ["de", "Link zum Posteingang", "app-inbox#what-is-the-inbox", "/inbox"],
  ["de", "Link zur Seite mit den API-Keys", "api-keys#how-do-i-create-an-api-key", "/profile/api-keys"],
  ["de", "Link zur Routinen-Seite", "app-routines#which-ids-does-the-page-have", "/routines"],
  ["de", "Webhook anlegen", "webhooks#how-do-i-create-a-webhook", "/company/webhooks"],
  ["de", "Kommen Webhooks in der richtigen Reihenfolge an?", "webhooks#are-deliveries-ordered", null],
  ["de", "Kann ich Filter mit ODER verknüpfen?", "filter-syntax#what-does-a-filter-rule-look-like", null],
  ["de", "Kontakte ohne Organisation finden", "filter-syntax#which-relationship-operators-exist", null],
  [
    "de",
    "Wo speichere ich die Telefonnummer eines Kontakts?",
    "app-records#what-is-special-about-each-record-type",
    "/contacts",
  ],
  ["de", "Wie lege ich eine Automatisierung an?", "app-routines#how-do-i-create-a-routine", "/routines"],
  ["de", "Kanal für Kollegen sichtbar machen", "app-profile#private-or-shared", "/profile/connected-accounts"],
  [
    "de",
    "Spam-Ordner im Posteingang ausblenden",
    "app-profile#what-does-the-folders-tab-control",
    "/profile/connected-accounts",
  ],
  [
    "de",
    "Sieht der Admin meine privaten Chats?",
    "app-inbox#which-conversations-do-i-see",
    "/profile/connected-accounts",
  ],
  ["de", "Eigene Rolle anlegen", "app-company#how-does-the-role-editor-work", "/company/roles"],
  [
    "de",
    "Deals in Opportunities umbenennen",
    "app-company#how-do-i-rename-record-types-in-the-data-model",
    "/company/settings",
  ],
  ["de", "Onboarding überspringen", "app-onboarding#kann-ich-teile-des-onboardings-uberspringen", "/onboarding/wizard"],
  [
    "en",
    "where can I change the stage field used for deal weighting",
    "app-company#how-do-stage-probabilities-and-totals-work",
    "/company/settings",
  ],
  [
    "de",
    "Wo ändere ich das Deal-Phasenfeld für die Gewichtung?",
    "app-company#how-do-stage-probabilities-and-totals-work",
    "/company/settings",
  ],
  [
    "en",
    "My Gmail channel says Reconnect needed",
    "app-profile#what-does-each-status-mean",
    "/profile/connected-accounts",
  ],
  [
    "en",
    "My Outlook channel shows Permission issue",
    "app-profile#what-does-each-status-mean",
    "/profile/connected-accounts",
  ],
  [
    "de",
    "Mein Gmail-Kanal zeigt Erneute Verbindung nötig",
    "app-profile#how-do-i-reactivate-resync-or-disconnect-a-channel",
    "/profile/connected-accounts",
  ],
  [
    "de",
    "Mein Outlook-Kanal zeigt Berechtigungsproblem",
    "app-profile#how-do-i-reactivate-resync-or-disconnect-a-channel",
    "/profile/connected-accounts",
  ],
  ["en", "how do I connect Gmail", "app-profile#how-do-i-connect-a-channel", "/profile/connected-accounts"],
  ["de", "Gmail verbinden", "app-profile#how-do-i-connect-a-channel", "/profile/connected-accounts"],
  ["en", "Error connecting my Gmail channel", "app-profile#how-do-i-connect-a-channel", "/profile/connected-accounts"],
  [
    "de",
    "Fehler beim Verbinden des Gmail-Kanals",
    "app-profile#how-do-i-connect-a-channel",
    "/profile/connected-accounts",
  ],
  [
    "en",
    "LinkedIn rate limit error",
    "messaging-rate-limits#what-are-the-limits-for-sending-and-profile-lookups",
    null,
  ],
  ["de", "LinkedIn Limit Fehler", "messaging-rate-limits#what-are-the-limits-for-sending-and-profile-lookups", null],
  ["de", "Claude erneute Verbindung", "connect-custom-connector#claude", null],
];

describeDatabase("documentation retrieval exact regression contracts", () => {
  const repo = new PrismaDocsChunkRepo();
  const fallback: UnifiedDocsDeps = { repo, embed: null, ranker: undefined };
  const scope = new AsyncLocalStorage<UnifiedDocsDeps>();
  const live = liveDocsRetrievalContractsEnabled() ? createLiveDocsRetrievalContracts(repo) : null;
  beforeAll(async () => {
    if (live) await live.prepare();
    else await repo.ensureCorpus(docsCorpus());
  }, 120_000);
  afterAll(async () => {
    if (live) await live.finish();
  }, 30_000);
  const deps = () => scope.getStore() ?? fallback;
  const itHosted = (title: string, run: () => Promise<void>, timeout = 120_000) => {
    const test = live ? it : it.skip;
    test(
      title,
      async () => {
        if (!live) throw new Error("Live documentation contracts were not enabled.");
        await live.run(title, () => scope.run(live.deps, run));
      },
      live ? Math.max(timeout, 240_000) : timeout,
    );
  };

  const searchResult = (args: { query: string; locale?: ContentLocale; source?: "docs" | "api" | "all" }) => {
    const input: Parameters<typeof unifiedDocsSearchResult>[0] = { locale: "en", source: "docs", ...args };
    const invoke = () => unifiedDocsSearchResult(input, deps());
    return live && scope.getStore() === live.deps
      ? live.admit({ kind: "search", query: input.query, locale: input.locale, source: input.source }, invoke)
      : invoke();
  };
  const getResult = (args: { slug: string; query?: string; locale?: ContentLocale; source?: "docs" | "api" }) => {
    const input: Parameters<typeof unifiedDocsPageResult>[0] = { locale: "en", source: "docs", ...args };
    const invoke = () => unifiedDocsPageResult(input, deps());
    return live && scope.getStore() === live.deps
      ? live.admit(
          { kind: "excerpt", query: input.query ?? "", locale: input.locale, source: input.source, slug: input.slug },
          invoke,
        )
      : invoke();
  };
  const search = async (args: Parameters<typeof searchResult>[0]) =>
    mcpToolResultText((await searchResult(args)) as McpToolResult);
  const getPage = async (args: Parameters<typeof getResult>[0]) =>
    mcpToolResultText((await getResult(args)) as McpToolResult);
  const searchHits = async (query: string, locale: ContentLocale = "en"): Promise<DocsSearchHit[]> =>
    (await searchResult({ query, locale })).structuredContent.results;
  const excerptOf = async (slug: string, query: string, locale: ContentLocale = "en") =>
    ((await getResult({ slug, query, locale })) as { structuredContent: { markdown: string } }).structuredContent
      .markdown;
  const firstLinkLine = (markdown: string) => markdown.split("\n").find((line) => line.startsWith("**Link:**")) ?? "";

  it("ranks the webhooks page first for a webhook signature query", async () => {
    const result = await search({ query: "webhook signature" });
    const raw = await searchResult({ query: "webhook signature", locale: "en", source: "docs" });
    expect(result).toContain("webhooks");
    expect(result.indexOf("webhooks")).toBeLessThan(result.indexOf("total"));
    expect(raw).toMatchObject({
      structuredContent: {
        results: expect.arrayContaining([
          expect.objectContaining({ url: expect.stringContaining("/en/docs/webhooks") }),
        ]),
      },
    });
  });

  it("searches the German corpus when locale is de", async () => {
    const result = await searchResult({ query: "Webhook", locale: "de", source: "docs" });
    expect(result).toMatchObject({
      structuredContent: {
        results: expect.arrayContaining([expect.objectContaining({ url: expect.stringContaining("/de/docs/") })]),
      },
    });
  });

  it("finds REST operations when source is api", async () => {
    const result = await searchResult({ query: "contact", locale: "en", source: "api" });
    expect(result).toMatchObject({
      structuredContent: {
        results: expect.arrayContaining([
          expect.objectContaining({ url: expect.stringContaining("/en/docs/openapi/") }),
        ]),
      },
    });
  });

  it("keeps every leading page candidate visible for a natural walkthrough query", async () => {
    const result = (await search({ query: "Walk me through connecting WhatsApp to the Customermates inbox." })).slice(
      0,
      512,
    );
    expect(result).toContain("app-inbox");
    expect(result).toContain("app-profile");
  });

  it("returns an empty result with a hint for gibberish", async () => {
    const result = await search({ query: "zzqxvhjkwpl" });
    expect(result).toContain("total=0");
    expect(result).toContain("hint");
  });

  it("gives every hit a readable snippet, even when the matching line is longer than the snippet", async () => {
    for (const [query, locale] of [
      ["webhooks page link", "en"],
      ["cancel subscription", "en"],
      ["create api key", "en"],
      ["how do I create an API key", "en"],
      ["webhook signature", "en"],
      ["Webhooks Seite Link", "de"],
    ] as const) {
      const empty = (await searchHits(query, locale))
        .filter(
          (hit) =>
            hit.snippet
              .replace(/^[^:]+: /, "")
              .replace(/\*\*[^*]+\*\*/g, "")
              .replace(/[…\s]/g, "") === "",
        )
        .map((hit) => `${hit.slug}#${hit.anchor}: ${hit.snippet}`);
      expect(empty, `${locale} "${query}"`).toEqual([]);
    }
  });

  it("marks each elided stretch of a snippet or an excerpt with one ellipsis", async () => {
    for (const [query, locale] of [
      ["webhooks page link", "en"],
      ["cancel subscription", "en"],
      ["create api key", "en"],
      ["how do I create an API key", "en"],
      ["webhook signature", "en"],
      ["Webhooks Seite Link", "de"],
    ] as const) {
      const doubled = (await searchHits(query, locale))
        .filter((hit) => hit.snippet.includes("… …"))
        .map((hit) => `${hit.slug}#${hit.anchor}: ${hit.snippet}`);
      expect(doubled, `${locale} "${query}"`).toEqual([]);
    }
    for (const [slug, query] of [
      ["app-records", "board view group by field"],
      ["api-keys", "rotate an api key"],
      ["concepts", "weighted pipeline value"],
    ] as const)
      expect(await excerptOf(slug, query), query).not.toMatch(/…\s*\n\s*…/);
  });

  itHosted(
    "answers a page-link question with a section whose link line names that page",
    async () => {
      const misses = (
        await Promise.all(
          PAGE_LINK_QUESTIONS.map(async ([locale, query, route]) => {
            const [best] = await searchHits(query, locale);
            const excerpt = best ? await excerptOf(best.slug, query, locale) : "";
            const routes = excerpt
              .split("\n")
              .filter((line) => line.startsWith("**Link:**"))
              .join(" ");
            return routes.includes(`\`${route}`) ? [] : [`${locale} "${query}" -> ${best?.slug}#${best?.anchor}`];
          }),
        )
      ).flat();
      expect(misses, misses.join("\n")).toEqual([]);
    },
    60000,
  );

  itHosted(
    "answers task and permission questions with the section that handles them and that section's link line",
    async () => {
      const misses = (
        await Promise.all(
          SECTION_QUESTIONS.map(async ([locale, query, expected, route]) => {
            const [best] = await searchHits(query, locale);
            const found = `${best?.slug}#${best?.anchor}`;
            const link = best ? firstLinkLine(await excerptOf(best.slug, query, locale)) : "";
            const routeOk = route === null || link.includes(`\`${route}`);
            return found === expected && routeOk
              ? []
              : [`${locale} "${query}" -> ${found} (link: ${link.slice(0, 60)})`];
          }),
        )
      ).flat();
      expect(misses, misses.join("\n")).toEqual([]);
    },
    60000,
  );

  itHosted(
    "answers where-is and take-me-to questions with the section that introduces that page, and its link line",
    async () => {
      const misses = (
        await Promise.all(
          (
            [
              ["en", "where do I find the audit log", "app-company#audit-logs-tab", "/company/audit-logs"],
              ["en", "Where can I find the roles?", "app-company#roles-tab", "/company/roles"],
              ["en", "take me to the webhooks page", "app-company#webhooks-tab", "/company/webhooks"],
              ["de", "Wo ist die Seite Kanäle?", "app-profile#channels-tab", "/profile/connected-accounts"],
              ["de", "Wo finde ich das Audit-Log?", "app-company#audit-logs-tab", "/company/audit-logs"],
            ] as const
          ).map(async ([locale, query, expected, route]) => {
            const [best] = await searchHits(query, locale);
            const found = `${best?.slug}#${best?.anchor}`;
            const link = best ? firstLinkLine(await excerptOf(best.slug, query, locale)) : "";
            return found === expected && link.includes(`\`${route}`) ? [] : [`${locale} "${query}" -> ${found}`];
          }),
        )
      ).flat();
      expect(misses, misses.join("\n")).toEqual([]);
    },
  );

  itHosted(
    "matches the user's words to the docs' words for sharing, change history, trial end and mailboxes",
    async () => {
      const misses = (
        await Promise.all(
          (
            [
              ["en", "can I share an email inbox with my colleagues", "app-profile#private-or-shared"],
              ["en", "who edited this contact, is there a history", "app-company#audit-logs-tab"],
              [
                "en",
                "what happens once the free trial expires",
                "app-company#what-happens-when-the-trial-ends-or-a-payment-fails",
              ],
              ["de", "Kann ich ein Postfach mit Kollegen teilen?", "app-profile#private-or-shared"],
              [
                "de",
                "Was passiert, wenn die Testphase abgelaufen ist?",
                "app-company#what-happens-when-the-trial-ends-or-a-payment-fails",
              ],
            ] as const
          ).map(async ([locale, query, expected]) => {
            const [best] = await searchHits(query, locale);
            const found = `${best?.slug}#${best?.anchor}`;
            return found === expected ? [] : [`${locale} "${query}" -> ${found}`];
          }),
        )
      ).flat();
      expect(misses, misses.join("\n")).toEqual([]);
    },
  );

  itHosted(
    "keeps a question that uses link as a verb on the relationships section, not on a section of record-page links",
    async () => {
      for (const query of ["link a contact to an organization", "how do I link a deal to a service?"]) {
        const [best] = await searchHits(query);
        expect(`${best?.slug}#${best?.anchor}`, query).toBe("concepts#how-do-relationships-link-records");
      }
    },
  );

  itHosted("keeps a question about the link between two records on the relationships section", async () => {
    for (const [locale, query] of [
      ["en", "Can I delete the link to an organization from a contact?"],
      ["en", "Where are the links between contacts and deals shown?"],
      ["en", "Is the link between a deal and its services stored with a quantity?"],
      ["de", "Wie entferne ich den Link zwischen Kontakt und Organisation?"],
    ] as const) {
      const [best] = await searchHits(query, locale);
      expect(`${best?.slug}#${best?.anchor}`, `${locale} "${query}"`).toBe(
        "concepts#how-do-relationships-link-records",
      );
    }
  });

  itHosted(
    "keeps questions about sharing a view or a filter with a colleague off the channel-sharing section",
    async () => {
      for (const [locale, query] of [
        ["en", "Can I share a saved view with my colleagues?"],
        ["de", "Wie kann ich eine Ansicht mit Kollegen teilen?"],
        ["de", "Kann ich eine gespeicherte Ansicht mit Kollegen teilen?"],
      ] as const) {
        const [best] = await searchHits(query, locale);
        expect(`${best?.slug}#${best?.anchor}`, `${locale} "${query}"`).toBe("app-records#how-do-saved-views-work");
      }
      for (const [locale, query] of [
        ["en", "How do I share a filtered list with a colleague?"],
        ["de", "Kann ich einen Filter mit Kollegen teilen?"],
      ] as const) {
        const [best] = await searchHits(query, locale);
        expect(`${best?.slug}#${best?.anchor}`, `${locale} "${query}"`).not.toBe("app-profile#private-or-shared");
      }
    },
  );

  it("credits a link line's synonym only to the query word it is a synonym of", async () => {
    const [logs] = await searchHits("Where are the logs of my self-hosted instance?");
    expect(logs?.slug).toBe("self-hosting");
    const [history] = await searchHits("Wo sehe ich den Änderungsverlauf eines Kontakts?", "de");
    expect(`${history?.slug}#${history?.anchor}`).toBe("app-company#audit-logs-tab");
  });

  itHosted(
    "answers common CRM question families with the section that handles them, whatever words the question uses",
    async () => {
      const misses = (
        await Promise.all(
          (
            [
              ["en", "What does Customermates cost per user?", "app-company#which-plans-are-there"],
              ["en", "What are your prices?", "app-company#which-plans-are-there"],
              ["de", "Was kostet Customermates?", "app-company#which-plans-are-there"],
              ["en", "How much does a Mate request cost in credits?", "app-assistant#credits"],
              [
                "en",
                "How do I install Customermates on my own server?",
                "self-hosting#how-do-i-install-customermates-with-docker-compose",
              ],
              [
                "de",
                "Wie installiere ich Customermates auf meinem eigenen Server?",
                "self-hosting#how-do-i-install-customermates-with-docker-compose",
              ],
              ["en", "install the MCP server in Cursor", "connect-cli#cursor"],
              ["de", "Wie richte ich einen Webhook ein?", "webhooks#how-do-i-create-a-webhook"],
              ["de", "Wie erstelle ich einen API-Schlüssel?", "api-keys#how-do-i-create-an-api-key"],
              [
                "de",
                "Wie füge ich ein eigenes Feld zu Kontakten hinzu?",
                "concepts#how-do-i-add-change-or-delete-a-custom-column",
              ],
              ["de", "E-Mail-Signatur einrichten", "app-inbox#how-do-i-set-an-email-signature"],
              ["de", "Link zur Mitgliederseite", "app-company#members-tab"],
              ["de", "Link zur Rollenseite", "app-company#roles-tab"],
              ["en", "Can users only see their own contacts?", "app-company#how-does-the-role-editor-work"],
              ["de", "Nur eigene Kontakte sehen", "app-company#how-does-the-role-editor-work"],
              ["en", "Can I restrict an API key to read-only?", "api-keys#what-permissions-does-a-key-have"],
              ["en", "Can I see my LinkedIn messages in the CRM?", "app-inbox#what-is-the-inbox"],
              ["en", "How many LinkedIn messages can I send per day?", "messaging-rate-limits"],
              ["en", "What can the MCP server do?", "mcp#tool-catalog"],
              ["de", "Welche Tools bietet der MCP-Server?", "mcp#tool-catalog"],
              ["en", "Which tools can Mate use?", "app-assistant#which-tools-can-mate-use"],
              [
                "en",
                "How do I sort a list by a custom field?",
                "app-records#how-do-i-switch-between-table-and-board-view",
              ],
              [
                "de",
                "Wie sortiere ich nach einem benutzerdefinierten Feld?",
                "app-records#how-do-i-switch-between-table-and-board-view",
              ],
              [
                "de",
                "Wie sortiere ich Aufgaben nach Fälligkeit?",
                "app-records#how-do-i-switch-between-table-and-board-view",
              ],
              ["de", "Deals nach Wert sortieren", "app-records#how-do-i-switch-between-table-and-board-view"],
              [
                "en",
                "How do I filter a list by a custom field?",
                "filter-syntax#which-operators-work-on-custom-columns",
              ],
              ["en", "Which tools are available to Mate?", "app-assistant#which-tools-can-mate-use"],
              ["en", "How much does Customermates cost for a team of 5?", "app-company#which-plans-are-there"],
              ["de", "Was zahle ich pro Nutzer?", "app-company#which-plans-are-there"],
              ["en", "Do I pay for inactive users?", "app-company#how-are-seats-counted-and-billed"],
              ["de", "Werde ich für inaktive Nutzer berechnet?", "app-company#how-are-seats-counted-and-billed"],
              [
                "en",
                "Does marking a conversation as closed notify the customer?",
                "app-inbox#what-do-the-thread-states-mean",
              ],
              ["en", "Can my manager read my private WhatsApp chats?", "app-inbox#which-conversations-do-i-see"],
              ["en", "How do I set up a webhook?", "webhooks#how-do-i-create-a-webhook"],
              ["de", "Wie lege ich einen neuen Kontakt an?", "app-records#how-do-i-add-a-record"],
              ["de", "Wie erstelle ich eine Routine, die automatisch läuft?", "app-routines#how-do-i-create-a-routine"],
              ["de", "Wie läuft der Import ab?", "app-records#how-do-i-import-or-export-records"],
            ] as const
          ).map(async ([locale, query, expected]) => {
            const [best] = await searchHits(query, locale);
            const found = `${best?.slug}#${best?.anchor}`;
            return (expected.includes("#") ? found === expected : best?.slug === expected)
              ? []
              : [`${locale} "${query}" -> ${found}`];
          }),
        )
      ).flat();
      expect(misses, misses.join("\n")).toEqual([]);
    },
    60000,
  );

  itHosted("answers a page-address question with a German page compound through that page's link line", async () => {
    for (const [query, route] of [
      ["Link zur Mitgliederseite", "/company/members"],
      ["Wo ist die Webhookseite?", "/company/webhooks"],
    ] as const) {
      const [best] = await searchHits(query, "de");
      expect(best, query).toBeDefined();
      expect(firstLinkLine(await excerptOf(best?.slug ?? "", query, "de")), query).toContain(`\`${route}`);
    }
  });

  itHosted(
    "keeps responsibility and deal-worth questions off the plans table, and sort questions off the theme and signature",
    async () => {
      for (const query of [
        "Who is in charge of a task?",
        "Who is in charge of a deal?",
        "What is the deal worth after weighting?",
        "How much is this deal worth?",
      ]) {
        const found = (await searchHits(query)).slice(0, 2).map((hit) => `${hit.slug}#${hit.anchor}`);
        expect(found, query).not.toContain("app-company#which-plans-are-there");
      }
      for (const [locale, query] of [
        ["en", "Can I sort the inbox by date?"],
        ["de", "Kann ich den Posteingang sortieren?"],
        ["de", "Wie sortiere ich die Suchergebnisse?"],
        ["de", "Wie sortiere ich Aufgaben nach Fälligkeit?"],
      ] as const) {
        const [best] = await searchHits(query, locale);
        expect(best?.slug, `${locale} "${query}"`).not.toBe("app-profile");
        expect(best?.anchor, `${locale} "${query}"`).not.toBe("how-do-i-set-an-email-signature");
      }
    },
  );

  itHosted("keeps a question about a new column off the section that adds records", async () => {
    for (const query of ["how do I add a new column", "create a new column"]) {
      const [best] = await searchHits(query);
      expect(`${best?.slug}#${best?.anchor}`, query).not.toBe("app-records#how-do-i-add-a-record");
    }
  });

  it("names the best page's url in the text and lets the snippet run past its heading", async () => {
    for (const [query, locale] of [
      ["download invoices", "en"],
      ["how do I change my language or theme", "en"],
      ["Wie kündige ich mein Abonnement", "de"],
    ] as const) {
      const result = await searchResult({ query, locale, source: "docs" });
      const text = mcpToolResultText(result);
      const [best] = (
        result as {
          structuredContent: {
            results: DocsSearchHit[];
          };
        }
      ).structuredContent.results;
      const heading = best.section.split(" > ").at(-1) ?? "";
      const snippet = text.slice(text.indexOf("\nsnippet=") + "\nsnippet=".length);
      expect(text, query).toContain(`\nbest=${best.url}\n`);
      expect(snippet.startsWith(`${heading}: `), query).toBe(true);
      expect(snippet.length, query).toBeGreaterThan(heading.length + 40);
      expect(text.length, query).toBeLessThanOrEqual(500);
    }
    expect(searchDocsTool.description).toContain("the best page's url and its snippet in text");
  });

  it("keeps full ranked hits in structured content while bounding model-facing text", async () => {
    const result = await searchResult({ query: "webhook", locale: "en", source: "docs" });
    expect(mcpToolResultText(result).length).toBeLessThanOrEqual(500);
    expect(result).toMatchObject({ structuredContent: { total: expect.any(Number) } });
    const hits = (
      result as {
        structuredContent: {
          results: DocsSearchHit[];
        };
      }
    ).structuredContent.results;
    expect(hits.slice(0, 2)).toEqual(
      expect.arrayContaining([expect.objectContaining({ url: expect.stringContaining("/en/docs/webhooks") })]),
    );
  });

  itHosted("puts the requested detail inside the bounded agent-visible prefix", async () => {
    const result = await getPage({
      slug: "app-profile",
      query: "Walk me through connecting WhatsApp to the Customermates inbox.",
    });
    const bounded = result.slice(0, 512);
    expect(bounded).toContain("nav-profile-connected-accounts");
    expect(bounded).toContain("profile-connected-accounts-connect");
    expect(bounded).toContain("WhatsApp");
  });

  itHosted("excerpts the section search_docs names, with that section's own link line", async () => {
    for (const [locale, query, route] of [
      ["en", "roles page URL", "/company/roles"],
      ["de", "URL der Rollen-Seite", "/company/roles"],
      ["de", "Wie lade ich ein Mitglied ein", "/company/members"],
      ["en", "webhooks page URL", "/company/webhooks"],
      ["de", "URL der Webhooks-Seite", "/company/webhooks"],
      ["de", "URL der Unternehmenseinstellungen-Seite", "/company/settings"],
    ] as const) {
      const excerpt = await excerptOf("app-company", query, locale);
      expect(firstLinkLine(excerpt), `${locale} "${query}"`).toContain(`\`${route}\``);
      const best = (await searchHits(query, locale)).find((hit) => hit.slug === "app-company");
      if (best) expect(excerpt.split("\n")[0], `${locale} "${query}"`).toContain(best.section.split(" > ").at(-1));
    }
  });

  it("puts the section a query names first and keeps its link line, steps included", async () => {
    for (const [locale, slug, heading, route] of [
      ["en", "connect-custom-connector", "Can ChatGPT use an API key instead of OAuth?", "/profile/api-keys"],
      ["de", "connect-custom-connector", "Kann ChatGPT statt OAuth einen API-Key nutzen?", "/profile/api-keys"],
      ["en", "mcp", "Connect a client", "/profile/api-keys"],
      ["en", "architecture-security", "How are webhook secrets and destinations secured?", "/company/webhooks"],
      ["en", "app-profile", "Profile settings page", "/profile/settings"],
    ] as const) {
      const excerpt = await excerptOf(slug, heading, locale);
      const [firstLine] = excerpt.split("\n");
      expect(firstLine, `${slug} "${heading}"`).toMatch(/^#+ /);
      expect(firstLine.replace(/^#+ /, ""), `${slug} "${heading}"`).toBe(heading);
      expect(firstLinkLine(excerpt), `${slug} "${heading}"`).toContain(`\`${route}\``);
    }
    expect((await excerptOf("app-company", "roles-tab")).split("\n")[0]).toBe("## Roles page");
  });

  it("keeps the table row, or the sentence deep in a paragraph, that answers the query inside the bounded excerpt", async () => {
    for (const [slug, query, header, answer] of [
      [
        "app-company",
        "does switching the currency convert amounts",
        "| Field | What it does |",
        "switching does not convert amounts",
      ],
      [
        "app-profile",
        "which setting decides the number and date format",
        "| Field | Id | Options and rules | Effect |",
        "| **Formatting Locale** |",
      ],
      ["app-routines", "what is the default schedule of a routine", null, "The default schedule is daily at 09:00."],
    ] as const) {
      const excerpt = await excerptOf(slug, query);
      expect(excerpt, query).toContain(answer);
      if (header) expect(excerpt.indexOf(header), query).toBeGreaterThan(-1);
      if (header) expect(excerpt.indexOf(header), query).toBeLessThan(excerpt.indexOf(answer));
      expect(excerpt.length, query).toBeLessThanOrEqual(1400);
      expect(firstLinkLine(excerpt), query).toMatch(/`\/[a-z]/);
    }
  });

  it("keeps the step that answers a question in the words of that step, not a row that shares one word", async () => {
    const excerpt = await excerptOf("webhooks", "Wo trage ich die Webhook-URL ein", "de");
    expect(excerpt).toContain("**UI:** Um einen Webhook anzulegen");
    expect(firstLinkLine(excerpt)).toContain("`/company/webhooks`");
  });

  itHosted("answers a channel status question with the instruction to reactivate the channel", async () => {
    for (const [locale, query, action] of [
      ["en", "My Gmail channel says Reconnect needed", "**Reactivate**"],
      ["de", "Mein Gmail-Kanal zeigt Erneute Verbindung nötig", "**Reaktivieren**"],
    ] as const) {
      const excerpt = await excerptOf("app-profile", query, locale);
      expect(excerpt, query).toContain(action);
      expect(firstLinkLine(excerpt), query).toContain("`/profile/connected-accounts`");
    }
  });

  it("keeps the formula a calculation question asks for, and the link line of the section that states it", async () => {
    for (const [locale, query, formula] of [
      ["en", "How is the weighted pipeline value calculated?", "multiplied by the weight of its current option"],
      [
        "de",
        "Wie wird der gewichtete Pipeline-Wert berechnet?",
        "multipliziert mit dem Gewicht seiner aktuellen Option",
      ],
    ] as const) {
      const excerpt = await excerptOf("concepts", query, locale);
      expect(excerpt, query).toContain(formula);
      expect(
        excerpt.split("\n").some((line) => line.startsWith("**Link:**") && line.includes("`/company/settings`")),
        query,
      ).toBe(true);
      expect(excerpt.length, query).toBeLessThanOrEqual(1400);
    }
  });

  itHosted("keeps the definition of the read access a who-sees-what question names", async () => {
    for (const [locale, query, definition] of [
      [
        "en",
        "How can I restrict a salesperson to only the deals assigned to them?",
        "**Assigned** only the records the member is an assigned user of",
      ],
      [
        "de",
        "Wie erstelle ich eine eigene Rolle mit eingeschränkten Rechten?",
        "**Zugewiesen** nur die Datensätze, denen das Mitglied zugewiesen ist",
      ],
    ] as const)
      expect(await excerptOf("app-company", query, locale), query).toContain(definition);
  });

  it("returns a top section of 700 to 1,400 characters whole, before anything from the next section", async () => {
    for (const [locale, slug, query, last] of [
      [
        "de",
        "app-routines",
        "Welche Limits gelten für Routinen?",
        "Übersprungene Läufe zählen nicht gegen die Stundenobergrenze.",
      ],
      ["en", "app-company", "Which plans are there?", "Hosted AI credits per active user and month"],
    ] as const) {
      const excerpt = await excerptOf(slug, query, locale);
      const linkEnd = excerpt.indexOf("\n", excerpt.indexOf("**Link:**"));
      const top = linkEnd === -1 ? excerpt : excerpt.slice(0, linkEnd);
      expect(top.length, query).toBeGreaterThan(700);
      expect(top.length, query).toBeLessThanOrEqual(1400);
      expect(top, query).not.toContain("…");
      expect(top, query).toContain(last);
      expect(excerpt.length, query).toBeLessThanOrEqual(1400);
    }
  });
});
