import { z } from "zod";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { appPath } from "./app-paths";
import { mintApiKey } from "./api-key";
import { localE2eEnvironment } from "./local-environment";
import { test, expect } from "./fixtures";

const Page = z.object({ id: z.uuid(), title: z.string() });
const Graph = z.object({
  nodes: z.array(z.object({ id: z.uuid(), inbound: z.number(), outbound: z.number(), x: z.number(), y: z.number() })),
  links: z.array(z.object({ source: z.uuid(), target: z.uuid() })),
});

test.use({ viewport: { width: 1600, height: 1000 } });

test("opens the Knowledge Base as a map, previews a page beside it and opens the page", async ({
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
        ],
      },
    });
    expect(first.ok()).toBe(true);
    const [guide, refunds] = z.array(Page).parse(await first.json());
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
    expect(graph.nodes.map(({ id }) => id).sort()).toEqual([guide.id, refunds.id, onboarding.id].sort());
    expect(graph.links).toEqual(
      expect.arrayContaining([
        { source: onboarding.id, target: refunds.id },
        { source: onboarding.id, target: guide.id },
      ]),
    );
    expect(graph.nodes.find(({ id }) => id === guide.id)).toMatchObject({ inbound: 1, x: 0.5, y: 0.5 });

    const linksResponse = await api.post("/api/v1/wiki/links", { data: { id: refunds.id } });
    expect(linksResponse.ok()).toBe(true);
    expect(await linksResponse.json()).toMatchObject({
      id: refunds.id,
      linkedFrom: [{ id: onboarding.id, title: "Onboarding", kind: "procedure" }],
      linksTo: [],
      missing: 0,
    });

    await page.goto(appPath(workspace.slug, "/wiki"));
    const map = page.getByRole("application", { name: englishMessages.Wiki.graph.canvasLabel });
    await expect(map).toBeVisible();
    await expect(map.getByRole("button")).toHaveCount(3);
    await expect.poll(() => map.locator("> g").getAttribute("transform")).not.toBe("translate(0 0) scale(1)");
    await expect(page.getByRole("navigation", { name: englishMessages.Wiki.pagesLabel })).toHaveCount(0);

    await page.getByRole("searchbox", { name: englishMessages.Wiki.graph.search }).fill("refund");
    await expect(map.getByRole("button", { name: /^Refund policy/ })).toHaveAttribute("tabindex", "0");
    await expect(map.getByRole("button", { name: /^Onboarding/ })).toHaveAttribute("tabindex", "-1");
    await page.getByRole("searchbox", { name: englishMessages.Wiki.graph.search }).fill("");

    await map.getByRole("button", { name: /^Onboarding/ }).click();
    const drawer = page.getByRole("complementary", { name: /Onboarding/ });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("heading", { name: "Onboarding", level: 2 })).toBeVisible();
    await expect(drawer.getByText("A new customer signs the contract.")).toBeVisible();
    await expect(drawer.getByText("Read the", { exact: false })).toBeVisible();

    await drawer.getByRole("tab", { name: englishMessages.Wiki.graph.segments.links }).click();
    await expect(drawer.getByRole("button", { name: "Refund policy" })).toBeVisible();
    await drawer.getByRole("button", { name: "Refund policy" }).click();
    const refundsDrawer = page.getByRole("complementary", { name: /Refund policy/ });
    await expect(refundsDrawer.getByRole("heading", { name: "Refund policy", level: 2 })).toBeVisible();
    await expect(refundsDrawer.getByRole("button", { name: "Onboarding" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("complementary")).toHaveCount(0);

    const leftmost = await map.evaluate((svg) => {
      const nodes = [...svg.querySelectorAll<SVGGElement>("[data-wiki-graph-node]")];
      const x = (node: SVGGElement) => node.getBoundingClientRect().left;
      return nodes.sort((a, b) => x(a) - x(b))[0]?.getAttribute("aria-label") ?? "";
    });
    const leftmostTitle = leftmost.replace(/ \([^)]*\)$/, "");
    await map.getByRole("button", { name: leftmost, exact: true }).dblclick();
    await expect(page).toHaveURL(/[?&]page=/);
    await expect(page.getByRole("textbox", { name: englishMessages.Wiki.pageTitle, exact: true })).toHaveValue(
      leftmostTitle,
    );
    await expect(page.getByRole("navigation", { name: englishMessages.Wiki.pagesLabel })).toBeVisible();

    await page.goto(appPath(workspace.slug, "/wiki"));
    await expect(map).toBeVisible();
    await map.getByRole("button", { name: /^Operating Guide/ }).click();
    await page.getByRole("complementary").getByRole("button", { name: englishMessages.Wiki.graph.openPage }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]page=${guide.id}`));
    await expect(page.getByRole("textbox", { name: englishMessages.Wiki.pageTitle, exact: true })).toHaveValue(
      "Operating Guide",
    );
  } finally {
    await api.dispose();
  }
});
