import type { Locator, Request } from "@playwright/test";

import { z } from "zod";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { mintApiKey } from "./api-key";
import { localE2eEnvironment } from "./local-environment";
import { test, expect } from "./fixtures";

const Page = z.object({ id: z.uuid(), markdown: z.string() });

test.use({ viewport: { width: 1600, height: 1000 } });

// Puts the caret after a block's last character; ProseMirror reads the native selection on selectionchange.
async function caretToEnd(block: Locator) {
  await block.click();
  await block.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let last: Text | null = null;
    while (walker.nextNode()) last = walker.currentNode as Text;
    if (last) getSelection()?.collapse(last, last.length);
  });
  await expect.poll(() => block.evaluate((element) => element.contains(getSelection()?.anchorNode ?? null))).toBe(true);
  await block.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

test("edits fenced code blocks in a Knowledge Base page and keeps them as fenced Markdown", async ({
  page,
  playwright,
  database,
  workspace,
  isMobile,
}) => {
  const { baseUrl } = localE2eEnvironment();
  const { key } = await mintApiKey(database, workspace, "Wiki code block verification");
  const api = await playwright.request.newContext({ baseURL: baseUrl, extraHTTPHeaders: { "x-api-key": key } });
  try {
    const created = await api.post("/api/v1/wiki/create", {
      data: {
        pages: [
          {
            title: "Local setup",
            markdown: "# Setup\n\nInstall first.\n\n```bash\nyarn install\n```\n\n## Run\n\nStart the server.",
          },
        ],
      },
    });
    expect(created.ok()).toBe(true);
    const [wikiPage] = z.array(Page.pick({ id: true })).parse(await created.json());

    await page.goto(`/en/wiki?page=${wikiPage.id}`);
    const document = page.locator(".tiptap");
    const fencedBlock = document.locator("pre code").first();
    await expect(fencedBlock).toHaveText("yarn install");
    await expect(document.locator("pre").first()).toHaveCSS("overflow-x", "auto");
    const bar = page.locator('[data-slot="unsaved-changes-bar"]');
    await expect(bar).toHaveCount(0);
    const title = page.getByRole("textbox", { name: englishMessages.Wiki.pageTitle, exact: true });
    await title.fill("Discarded title");
    await expect(bar).toBeVisible();
    await bar.getByRole("button", { name: englishMessages.Common.actions.cancel, exact: true }).click();
    await expect(title).toHaveValue("Local setup");
    await expect(bar).toHaveCount(0);
    await expect(fencedBlock).toHaveText("yarn install");

    if (!isMobile) {
      const outline = page.getByRole("navigation", { name: englishMessages.Wiki.onThisPage });
      await expect(outline.getByRole("link")).toHaveText(["Setup", "Run"]);
      await outline.getByRole("link", { name: "Run" }).click();
      await expect(document.locator("#wiki-heading-1")).toBeInViewport();
    }

    await caretToEnd(fencedBlock);
    await page.keyboard.press("Enter");
    await page.keyboard.type("yarn dev");

    await caretToEnd(document.getByText("Start the server."));
    await page.keyboard.press("Enter");
    await page.keyboard.type("```js ");
    await page.keyboard.type("console.log(1)");
    await expect(document.locator("pre code")).toHaveText(["yarn install\nyarn dev", "console.log(1)"]);

    // Saving refreshes the route; Firefox aborts that refresh on reload and Next then navigates again, aborting the reload.
    const refreshes: Request[] = [];
    const pending = new Set<Request>();
    page.on("request", (request) => {
      const headers = request.headers();
      if (headers["rsc"] !== "1" || headers["next-router-prefetch"] || new URL(request.url()).pathname !== "/en/wiki")
        return;
      refreshes.push(request);
      pending.add(request);
    });
    page.on("requestfinished", (request) => pending.delete(request));
    page.on("requestfailed", (request) => pending.delete(request));
    await expect(bar).toBeVisible();
    await expect(bar.getByRole("button", { name: englishMessages.Common.actions.cancel, exact: true })).toBeInViewport({ ratio: 1 });
    await expect(bar.getByRole("button", { name: englishMessages.Common.actions.save, exact: true })).toBeInViewport({ ratio: 1 });
    await bar.getByRole("button", { name: englishMessages.Common.actions.save, exact: true }).click();
    await expect
      .poll(async () => {
        const read = await api.post("/api/v1/wiki/read", { data: { id: wikiPage.id } });
        return Page.parse(await read.json()).markdown;
      })
      .toBe(
        "# Setup\n\nInstall first.\n\n```bash\nyarn install\nyarn dev\n```\n\n## Run\n\nStart the server.\n\n```js\nconsole.log(1)\n```",
      );

    await expect(bar).toHaveCount(0);
    await expect.poll(() => refreshes.length > 0 && pending.size === 0).toBe(true);
    await page.reload();
    await expect(page.locator(".tiptap pre code")).toHaveText(["yarn install\nyarn dev", "console.log(1)"]);
  } finally {
    await api.dispose();
  }
});

test("keeps wiki top-bar actions available while guarding drafts and saving through the shared bar", async ({
  page,
  playwright,
  database,
  workspace,
  isMobile,
}, testInfo) => {
  await page.setViewportSize({ width: isMobile ? 390 : 1280, height: isMobile ? 780 : 800 });
  const { baseUrl } = localE2eEnvironment();
  const { key } = await mintApiKey(database, workspace, "Wiki draft action verification");
  const api = await playwright.request.newContext({ baseURL: baseUrl, extraHTTPHeaders: { "x-api-key": key } });
  try {
    const markdown = Array.from({ length: 60 }, (_, index) => `Saved paragraph ${index + 1}.`).join("\n\n");
    const created = await api.post("/api/v1/wiki/create", {
      data: { pages: [{ title: "Saved reference", markdown }] },
    });
    expect(created.ok()).toBe(true);
    const [wikiPage] = z.array(Page.pick({ id: true })).parse(await created.json());
    await page.goto(`/en/wiki?page=${wikiPage.id}`);
    const title = page.getByRole("textbox", { name: englishMessages.Wiki.pageTitle, exact: true });
    const newPage = page.getByRole("button", { name: englishMessages.Wiki.newPage, exact: true });
    const actions = page.getByRole("button", { name: englishMessages.Wiki.pageActions, exact: true });
    const bar = page.locator('[data-slot="unsaved-changes-bar"]');
    const confirmation = page.getByRole("alertdialog");
    await expect(page.locator('.tiptap[contenteditable="true"]')).toBeVisible();
    await expect(title).toHaveValue("Saved reference");
    await expect(bar).toHaveCount(0);
    await title.fill("Unsaved reference");
    await expect(title).toHaveValue("Unsaved reference");
    await expect(bar).toBeVisible();
    await expect(newPage).toBeEnabled();
    await expect(actions).toBeEnabled();
    const scrolled = await page.locator("#wiki-document-panel > .overflow-y-auto").evaluate((body) => {
      body.scrollTop = body.scrollHeight;
      return body.scrollTop;
    });
    expect(scrolled).toBeGreaterThan(0);
    await expect(bar.getByRole("button", { name: englishMessages.Common.actions.save, exact: true })).toBeInViewport({ ratio: 1 });
    await expect(bar.getByRole("button", { name: englishMessages.Common.actions.cancel, exact: true })).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: testInfo.outputPath("wiki-draft-actions.png"), animations: "disabled" });

    await newPage.click();
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: englishMessages.Common.actions.cancel, exact: true }).click();
    await expect(confirmation).not.toBeVisible();
    await expect(title).toHaveValue("Unsaved reference");
    await actions.click();
    await page.getByRole("menuitem", { name: englishMessages.Wiki.reload, exact: true }).click();
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(confirmation).not.toBeVisible();
    await expect(title).toHaveValue("Saved reference");
    await expect(bar).toHaveCount(0);

    await title.fill("Another unfinished reference");
    await newPage.click();
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(confirmation).not.toBeVisible();
    await expect(title).toHaveValue("");
    await expect(newPage).toBeVisible();
    await expect(actions).toHaveCount(0);
    await expect(bar).toBeVisible();
    await expect(bar).not.toContainText(englishMessages.Common.unsavedChanges);
    await bar.getByRole("button", { name: englishMessages.Common.actions.save, exact: true }).click();
    await expect(title).toHaveAttribute("aria-invalid", "true");
    await expect(title).toBeFocused();

    await title.fill("Created with the shared bar");
    await page.locator('.tiptap[contenteditable="true"]').fill("The saved draft is independent of the original page.");
    await bar.getByRole("button", { name: englishMessages.Common.actions.save, exact: true }).click();
    await expect(bar).toHaveCount(0);
    await expect(actions).toBeEnabled();
    await expect.poll(async () => (await database.query(
      'SELECT title,markdown FROM "WikiPage" WHERE "companyId"=$1 AND title=$2',
      [workspace.companyId, "Created with the shared bar"],
    )).rows).toEqual([{ title: "Created with the shared bar", markdown: "The saved draft is independent of the original page." }]);
    const original = await api.post("/api/v1/wiki/read", { data: { id: wikiPage.id } });
    expect(Page.parse(await original.json()).markdown).toBe(markdown);
  } finally {
    await api.dispose();
  }
});
