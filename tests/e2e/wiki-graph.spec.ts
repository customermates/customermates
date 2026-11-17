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
    await expect(sheet.getByText("Linked from 1 page", { exact: true })).toBeVisible();
    await expect(canvas.locator(`[data-wiki-graph-node="${refunds.id}"]`)).toHaveAttribute("aria-pressed", "true");

    // Links lists both directions, and a linked page opens in the same sheet.
    await sheet.getByRole("tab", { name: englishMessages.Wiki.graph.segments.links, exact: true }).click();
    await expect(sheet.getByText(`${englishMessages.Wiki.graph.linkedFrom} · 1`)).toBeVisible();
    await expect(sheet.getByText(`${englishMessages.Wiki.graph.linksTo} · 1`)).toBeVisible();
    await sheet.getByRole("button", { name: "Onboarding", exact: true }).click();
    const onboardingSheet = page.getByRole("dialog", { name: "Onboarding", exact: true });
    await expect(onboardingSheet).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`[?&]page=${onboarding.id}`));
    await onboardingSheet.getByRole("tab", { name: englishMessages.Wiki.graph.segments.page, exact: true }).click();
    await expect(onboardingSheet.getByText("A new customer signs the contract.")).toBeVisible();

    // Pinning from the sheet marks the page on the map; releasing the pin removes the mark.
    await onboardingSheet.getByRole("button", { name: englishMessages.Wiki.graph.pin, exact: true }).click();
    const onboardingNode = canvas.locator(`[data-wiki-graph-node="${onboarding.id}"]`);
    await expect(onboardingNode.locator("[data-wiki-graph-pin]")).toHaveCount(1);
    await expect(onboardingSheet.getByText(englishMessages.Wiki.graph.pinned, { exact: true })).toBeVisible();
    await onboardingSheet.getByRole("button", { name: englishMessages.Wiki.graph.unpin, exact: true }).click();
    await expect(onboardingNode.locator("[data-wiki-graph-pin]")).toHaveCount(0);

    // Escape closes the sheet and returns the address to the map.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).not.toHaveURL(/[?&]page=/);
    await expect(map).toBeVisible();

    // A direct link opens the page over the map; there is no separate full page any more.
    await page.goto(appPath(workspace.slug, `/wiki?page=${guide.id}`));
    await expect(page.getByRole("dialog", { name: "Operating Guide", exact: true })).toBeVisible();
    await expect(canvas).toBeVisible();
  } finally {
    await api.dispose();
  }
});
