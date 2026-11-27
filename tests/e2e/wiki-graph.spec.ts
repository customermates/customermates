import { z } from "zod";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { appPath } from "./app-paths";
import { mintApiKey } from "./api-key";
import { localE2eEnvironment } from "./local-environment";
import { test, expect } from "./fixtures";

const Page = z.object({ id: z.uuid(), title: z.string(), updatedAt: z.string() });
const Graph = z.object({
  nodes: z.array(z.object({ id: z.uuid(), inbound: z.number(), outbound: z.number(), x: z.number(), y: z.number() })),
  links: z.array(z.object({ source: z.uuid(), target: z.uuid() })),
});
const LinkReport = z.object({
  pages: z.number(),
  orphans: z.array(z.object({ id: z.uuid(), title: z.string() })),
  orphansTotal: z.number(),
  broken: z.array(z.object({ id: z.uuid(), missingPageIds: z.array(z.uuid()) })),
  brokenTotal: z.number(),
  syncing: z.boolean(),
});

test.use({ viewport: { width: 1600, height: 1000 } });

test("opens the Knowledge Base as a map and a page in the side sheet records open in", async ({
  page,
  playwright,
  database,
  workspace,
  isMobile,
}) => {
  test.skip(isMobile, "The map is a desktop view; a phone opens the page list.");
  const { baseUrl } = localE2eEnvironment();
  const { key } = await mintApiKey(database, workspace, "Wiki map verification");
  const api = await playwright.request.newContext({ baseURL: baseUrl, extraHTTPHeaders: { "x-api-key": key } });
  try {
    const first = await api.post("/api/v1/wiki/create", {
      data: {
        pages: [
          { title: "Operating Guide", kind: "guide", markdown: "Be concise and specific." },
          { title: "Refund policy", markdown: "Refunds within 14 days." },
          { title: "Old pricing", markdown: "Prices from last year." },
        ],
      },
    });
    expect(first.ok()).toBe(true);
    const [guide, refunds, oldPricing] = z.array(Page).parse(await first.json());
    const second = await api.post("/api/v1/wiki/create", {
      data: {
        pages: [
          {
            title: "Onboarding",
            kind: "procedure",
            whenToUse: "A new customer signs the contract.",
            markdown: `1. Read the [Refund policy](/wiki?page=${refunds.id}).\n2. Follow the [Operating Guide](/wiki?page=${guide.id}).`,
          },
        ],
      },
    });
    expect(second.ok()).toBe(true);
    const [onboarding] = z.array(Page).parse(await second.json());

    const graphResponse = await api.post("/api/v1/wiki/graph", { data: {} });
    expect(graphResponse.ok()).toBe(true);
    const graph = Graph.parse(await graphResponse.json());
    expect(graph.nodes.map(({ id }) => id).sort()).toEqual([guide.id, refunds.id, oldPricing.id, onboarding.id].sort());
    expect(graph.links).toEqual(
      expect.arrayContaining([
        { source: onboarding.id, target: refunds.id },
        { source: onboarding.id, target: guide.id },
      ]),
    );
    expect(graph.nodes.find(({ id }) => id === guide.id)).toMatchObject({ inbound: 1 });

    const linksResponse = await api.post("/api/v1/wiki/links", { data: { id: refunds.id } });
    expect(linksResponse.ok()).toBe(true);
    expect(await linksResponse.json()).toMatchObject({
      id: refunds.id,
      linkedFrom: [{ id: onboarding.id, title: "Onboarding", kind: "procedure" }],
      linksTo: [],
      missing: 0,
      missingPageIds: [],
    });

    // The link report names what a writer has to repair: pages nothing links to and links to pages that are gone.
    const reportResponse = await api.post("/api/v1/wiki/link-report", { data: {} });
    expect(reportResponse.ok(), await reportResponse.text()).toBe(true);
    const report = LinkReport.parse(await reportResponse.json());
    expect(report).toMatchObject({ pages: 4, orphansTotal: 2, brokenTotal: 0, syncing: false });
    expect(report.orphans.map(({ id }) => id).sort()).toEqual([oldPricing.id, onboarding.id].sort());

    // An edit to a part of the page links the orphan without resending the page, and records who looks after it.
    const edited = await api.post("/api/v1/wiki/update", {
      data: {
        id: refunds.id,
        expectedUpdatedAt: refunds.updatedAt,
        edits: [{ markdown: `## See also\n\nThe [old prices](/wiki?page=${oldPricing.id}).` }],
        owner: "Support team",
        verified: true,
      },
    });
    expect(edited.ok(), await edited.text()).toBe(true);
    expect(await edited.json()).toMatchObject({
      markdown: `Refunds within 14 days.\n\n## See also\n\nThe [old prices](/wiki?page=${oldPricing.id}).`,
      owner: "Support team",
    });
    const repaired = LinkReport.parse(await (await api.post("/api/v1/wiki/link-report", { data: {} })).json());
    expect(repaired.orphans.map(({ id }) => id)).toEqual([onboarding.id]);

    await page.goto(appPath(workspace.slug, "/wiki"));
    const map = page.getByRole("application", { name: englishMessages.Wiki.graph.canvasLabel });
    await expect(map).toBeVisible();
    await expect(map.getByRole("button")).toHaveCount(4);
    await expect.poll(() => map.locator("> g").getAttribute("transform")).not.toBe("translate(0 0) scale(1)");
    await expect(page.getByRole("navigation", { name: englishMessages.Wiki.pagesLabel })).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // The page search lives in the top bar and narrows the map as it is typed.
    const search = page.locator("header").getByRole("searchbox", { name: englishMessages.Wiki.graph.search });
    await search.fill("refund");
    await expect(map.getByRole("button", { name: /^Refund policy/ })).toHaveAttribute("tabindex", "0");
    await expect(map.getByRole("button", { name: /^Old pricing/ })).toHaveAttribute("tabindex", "-1");
    await search.fill("");

    // The kind filter keeps the guide in view.
    const filters = page.getByRole("tablist", { name: englishMessages.Wiki.graph.filter.label });
    await filters.getByRole("tab", { name: new RegExp(`^${englishMessages.Wiki.graph.filter.procedure}`) }).click();
    await expect(map.getByRole("button", { name: /^Onboarding/ })).toHaveAttribute("tabindex", "0");
    await expect(map.getByRole("button", { name: /^Operating Guide/ })).toHaveAttribute("tabindex", "0");
    await expect(map.getByRole("button", { name: /^Refund policy/ })).toHaveAttribute("tabindex", "-1");
    await filters.getByRole("tab", { name: new RegExp(`^${englishMessages.Wiki.graph.filter.all}`) }).click();

    // A click opens the page in the side sheet, at its own address, with the map still behind it.
    await map.getByRole("button", { name: /^Refund policy/ }).click();
    const sheet = page.getByRole("dialog", { name: "Refund policy", exact: true });
    await expect(sheet).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`[?&]page=${refunds.id}`));
    // While the sheet is open the map is outside the dialog, so it is addressed by its markup, not by its role.
    const canvas = page.locator("svg[data-wiki-graph]");
    await expect(canvas).toBeVisible();
    await expect(sheet.getByRole("textbox", { name: englishMessages.Wiki.pageTitle, exact: true })).toHaveValue(
      "Refund policy",
    );
    await expect(sheet.getByText("Refunds within 14 days.")).toBeVisible();
    await expect(sheet.getByText("Support team", { exact: true })).toBeVisible();
    await expect(sheet.getByText(/^Verified /)).toBeVisible();
    await expect(sheet.getByRole("button", { name: "1 page links here", exact: true })).toBeVisible();
    await expect(canvas.locator(`[data-wiki-graph-node="${refunds.id}"]`)).toHaveAttribute("aria-pressed", "true");

    // The linked pages close the document, once each, and a linked page opens in the same sheet.
    const linkedPages = sheet.locator("[data-wiki-linked-pages]");
    await expect(linkedPages.getByText(englishMessages.Wiki.graph.linkedPages, { exact: true })).toBeVisible();
    await expect(linkedPages.getByRole("button", { name: "Onboarding", exact: true })).toHaveCount(1);
    await linkedPages.getByRole("button", { name: "Onboarding", exact: true }).click();
    const onboardingSheet = page.getByRole("dialog", { name: "Onboarding", exact: true });
    await expect(onboardingSheet).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`[?&]page=${onboarding.id}`));
    await expect(onboardingSheet.getByText("A new customer signs the contract.")).toBeVisible();

    // Pinning from the more menu marks the page on the map; releasing the pin removes the mark.
    const moreActions = onboardingSheet.getByRole("button", { name: englishMessages.DataView.moreActions, exact: true });
    await moreActions.click();
    await page.getByRole("menuitem", { name: englishMessages.Wiki.graph.pin, exact: true }).click();
    const onboardingNode = canvas.locator(`[data-wiki-graph-node="${onboarding.id}"]`);
    await expect(onboardingNode.locator("[data-wiki-graph-pin]")).toHaveCount(1);
    await moreActions.click();
    await page.getByRole("menuitem", { name: englishMessages.Wiki.graph.unpin, exact: true }).click();
    await expect(onboardingNode.locator("[data-wiki-graph-pin]")).toHaveCount(0);
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(onboardingSheet).toBeVisible();

    // Escape closes the sheet and returns the address to the map.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).not.toHaveURL(/[?&]page=/);
    await expect(map).toBeVisible();

    // A direct link opens the page over the map for someone who has not chosen the pages view.
    await page.goto(appPath(workspace.slug, `/wiki?page=${guide.id}`));
    await expect(page.getByRole("dialog", { name: "Operating Guide", exact: true })).toBeVisible();
    await expect(canvas).toBeVisible();
  } finally {
    await api.dispose();
  }
});

test("switches between the map and the page list with full-page content, and remembers the choice", async ({
  page,
  playwright,
  database,
  workspace,
  isMobile,
}) => {
  test.skip(isMobile, "A phone always opens the page list; the switch is a desktop control.");
  const { baseUrl } = localE2eEnvironment();
  const { key } = await mintApiKey(database, workspace, "Wiki views verification");
  const api = await playwright.request.newContext({ baseURL: baseUrl, extraHTTPHeaders: { "x-api-key": key } });
  try {
    const created = await api.post("/api/v1/wiki/create", {
      data: {
        pages: [
          { title: "Pricing", markdown: "Three plans." },
          { title: "Operating Guide", kind: "guide", markdown: "Be concise and specific." },
          {
            title: "Onboarding",
            kind: "procedure",
            whenToUse: "A new customer signs the contract.",
            markdown:
              "# Before the call\n\n1. Read the notes.\n\n## During the call\n\n1. Ask.\n\n## After the call\n\n1. Write.",
          },
        ],
      },
    });
    expect(created.ok(), await created.text()).toBe(true);
    const [pricing, guide, onboarding] = z.array(Page).parse(await created.json());
    const storedView = async () => {
      const result = await database.query(
        'SELECT settings FROM "P13n" WHERE "userId" = $1 AND "p13nId" = \'wiki-layout\'',
        [workspace.userId],
      );
      return (result.rows[0] as { settings: { view?: string } | null } | undefined)?.settings?.view ?? null;
    };

    await page.goto(appPath(workspace.slug, "/wiki"));
    const canvas = page.locator("svg[data-wiki-graph]");
    await expect(canvas).toBeVisible();
    const views = page.locator("header").getByRole("tablist", { name: englishMessages.Wiki.view.label });
    const mapTab = views.getByRole("tab", { name: englishMessages.Wiki.view.map, exact: true });
    const pagesTab = views.getByRole("tab", { name: englishMessages.Wiki.view.pages, exact: true });
    await expect(mapTab).toHaveAttribute("aria-selected", "true");

    // The pages view lists every page beside the open one and opens the guide when the address names no page.
    await pagesTab.click();
    const rail = page.getByRole("navigation", { name: englishMessages.Wiki.pagesLabel });
    const document = page.getByRole("region", { name: englishMessages.Wiki.document, exact: true });
    const title = document.getByRole("textbox", { name: englishMessages.Wiki.pageTitle, exact: true });
    await expect(rail.getByRole("link")).toHaveText(["Operating Guide", "Onboarding", "Pricing"]);
    await expect(canvas).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`[?&]page=${guide.id}`));
    await expect(title).toHaveValue("Operating Guide");
    await expect(document.getByText("Be concise and specific.")).toBeVisible();
    await expect(rail.getByRole("link", { name: "Operating Guide", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(storedView).toBe("pages");

    // A page chosen in the list replaces the content in place and gets its own address.
    await rail.getByRole("link", { name: "Onboarding", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]page=${onboarding.id}`));
    await expect(title).toHaveValue("Onboarding");
    await expect(document.getByText("A new customer signs the contract.")).toBeVisible();
    const outline = document.getByRole("navigation", { name: englishMessages.Wiki.onThisPage });
    await expect(outline.getByRole("button")).toHaveText(["Before the call", "During the call", "After the call"]);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // An edit is saved from the full page like from the sheet.
    await document.getByText("Read the notes.").click();
    await page.keyboard.press("End");
    await page.keyboard.type(" Twice.");
    await page.getByRole("button", { name: englishMessages.Common.actions.save, exact: true }).click();
    await expect
      .poll(async () => {
        const result = await database.query('SELECT markdown FROM "WikiPage" WHERE id = $1', [onboarding.id]);
        return (result.rows[0] as { markdown: string } | undefined)?.markdown ?? "";
      })
      .toContain("Read the notes. Twice.");

    // The choice is the person's own and survives a reload, also for a direct link.
    await page.reload();
    await expect(pagesTab).toHaveAttribute("aria-selected", "true");
    await expect(title).toHaveValue("Onboarding");
    await page.goto(appPath(workspace.slug, `/wiki?page=${pricing.id}`));
    await expect(title).toHaveValue("Pricing");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // A new page is written in place; cancelling returns to the page that was open.
    await page.locator("header").getByRole("button", { name: englishMessages.Wiki.newPage, exact: true }).click();
    await expect(title).toHaveValue("");
    await page.getByRole("button", { name: englishMessages.Common.actions.cancel, exact: true }).click();
    await expect(title).toHaveValue("Pricing");

    // The page can be shown on the map and opened from there as a full page again.
    await document.getByRole("button", { name: englishMessages.Wiki.view.showOnMap, exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Pricing", exact: true });
    await expect(sheet).toBeVisible();
    await expect(canvas).toBeVisible();
    await expect.poll(storedView).toBe("map");
    await sheet.getByRole("button", { name: englishMessages.Wiki.view.fullPage, exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(title).toHaveValue("Pricing");
    await expect(pagesTab).toHaveAttribute("aria-selected", "true");
    await expect.poll(storedView).toBe("pages");
  } finally {
    await api.dispose();
  }
});
