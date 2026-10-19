import type { Locator } from "@playwright/test";

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

    await page.getByRole("button", { name: englishMessages.Common.actions.save, exact: true }).first().click();
    await expect
      .poll(async () => {
        const read = await api.post("/api/v1/wiki/read", { data: { id: wikiPage.id } });
        return Page.parse(await read.json()).markdown;
      })
      .toBe(
        "# Setup\n\nInstall first.\n\n```bash\nyarn install\nyarn dev\n```\n\n## Run\n\nStart the server.\n\n```js\nconsole.log(1)\n```",
      );

    await page.reload();
    await expect(page.locator(".tiptap pre code")).toHaveText(["yarn install\nyarn dev", "console.log(1)"]);
  } finally {
    await api.dispose();
  }
});
