import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { chromium, type Locator, type Page } from "@playwright/test";

import { newCaptureContext, openReadyPage, sha256, withRetries, workspaceTimeZone, type CaptureViewport } from "./lib/capture-page";
import { isLoopbackBaseUrl } from "./lib/capture-solutions-options";

import { DEMO_DEFAULT_RECORD_TYPE_IDS } from "@/components/marketing/product-demo-src";
import { findSolution } from "@/core/solutions/solution-catalog";
import { CONTENT_LOCALES, type ContentLocale } from "@/i18n/locale-registry";
import type { HomepageCaptureName } from "@/app/[locale]/(static)/components/homepage-captures";
import captureVersions from "@/app/[locale]/(static)/components/homepage-capture-versions.json";

// Homepage product stills from the seeded local demo instance (APP_MODE=demo, prisma db seed), in both themes and
// every content locale. Section stills are clipped to the bounding box of real UI elements (a panel, whole message
// rows, whole board columns, table columns) plus an even gutter, so no crop runs through text, a card or a column.
// Scenarios pick seeded items by position, which is the same in every locale of the small-business story.
// Usage: tsx scripts/capture-homepage.ts [--base-url http://127.0.0.1:3000] [--only name,name]
// Writes public/captures/<theme>/<name>-<locale>.png and prints the size and sha256 of every file as JSON.

type Theme = "dark" | "light";

const SOLUTION = findSolution("smb");
// inbox thread list positions in the small-business story
const THREAD = { draft: 0, linkedin: 4, whatsapp: 1 } as const;
// contact list position of the partner at the law firm (James Finch, Jakob Fink in German)
const PARTNER_ROW = 6;
const GUTTER = 12;

const DESKTOP: CaptureViewport = { deviceScaleFactor: 2, height: 900, width: 1440 };
const DESKTOP_WIDE: CaptureViewport = { deviceScaleFactor: 2, height: 900, width: 1600 };
const NARROW: CaptureViewport = { deviceScaleFactor: 2.5, height: 1000, width: 1024 };
const PHONE: CaptureViewport = { deviceScaleFactor: 2, height: 844, width: 390 };

type Shot = {
  clip?: (page: Page) => Promise<Locator[]>;
  name: HomepageCaptureName;
  prepare?: (page: Page, locale: ContentLocale) => Promise<void>;
  route: (locale: ContentLocale) => string;
  viewport: CaptureViewport;
  // space added around the clip elements; 0 when they carry their own padding
  gutter?: number;
  // the clip never reaches past this element, so a gutter stops at the edge of the surface it belongs to
  within?: (page: Page) => Locator;
  // right edge of the last whole table column on a phone; the viewport narrows to it so no next column peeks in
  fitWidth?: (page: Page) => Promise<number>;
};

const route = (path: string) => (locale: ContentLocale) => `/${locale}/w/${SOLUTION.workspaceSlugs[locale]}/${path}`;
const records = (list: "contacts" | "deals") => (locale: ContentLocale) =>
  route(`records/${DEMO_DEFAULT_RECORD_TYPE_IDS[locale][list]}`)(locale);

async function closeAgentPanel(page: Page): Promise<void> {
  const close = page.locator("#agent-panel-dialog button[aria-label*='lose']").first();
  if (await close.isVisible().catch(() => false)) await close.click();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);
  await closeAgentPanel(page);
}

// the header and cards of the first whole board columns
async function boardColumns(page: Page, count: number): Promise<Locator[]> {
  const columns = page.locator("main [data-group-key]");
  const nodes: Locator[] = [];
  for (let index = 0; index < Math.min(await columns.count(), count); index++) {
    const column = columns.nth(index);
    nodes.push(column.locator("[data-item-actions]").first());
    const cards = column.locator('[aria-roledescription="draggable"]');
    for (let card = 0; card < (await cards.count()); card++) nodes.push(cards.nth(card));
  }
  return nodes;
}

// the right edge of the Owner column, the second table column
async function ownerColumnEdge(page: Page): Promise<number> {
  const box = (await page.locator("main table thead th").nth(1).boundingBox())!;
  return Math.round(box.x + box.width);
}

// the one accent of the still: the saved reply draft carries a ring in the app's own primary token
async function markDraft(page: Page): Promise<void> {
  await page.locator("main [data-email-header]").last().evaluate((header) => {
    let card: HTMLElement | null = header as HTMLElement;
    while (card && getComputedStyle(card).borderTopLeftRadius === "0px") card = card.parentElement;
    if (!card) throw new Error("the reply draft has no card");
    card.style.boxShadow = "0 0 0 2px var(--primary)";
  });
}

async function openThread(page: Page, position: number): Promise<void> {
  await page.locator("#inbox-thread-list button[data-thread-id]").nth(position).click();
  await page.waitForURL(/threadId=/u, { timeout: 20_000 });
  await settle(page);
}

async function openRow(page: Page, position: number): Promise<void> {
  // the row link opens a drawer; the still shows the full record page that the same link points at. Phones list
  // records as cards, so the link is read from the table at desktop width.
  const phone = page.viewportSize()!;
  if (phone.width < DESKTOP.width) await page.setViewportSize({ height: DESKTOP.height, width: DESKTOP.width });
  const href = await page.locator("main tbody tr").nth(position).locator("a[href]").first().getAttribute("href");
  await page.setViewportSize(phone);
  if (!href) throw new Error(`${page.url()}: row ${position} has no record link`);
  const workspace = page.url().replace(/\/records\/.*$/u, "");
  await page.goto(`${workspace}${href}`, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await settle(page);
}

async function openPipelineView(page: Page): Promise<void> {
  await page.locator("main").getByText(/^pipeline$/iu).first().click();
  await page.waitForURL(/viewMode=card/u, { timeout: 20_000 });
  await settle(page);
}

// the data model graph zoomed to the deals list and its line items (their sub-list group), as on the homepage stage;
// the wheel pans this graph, so it centres the group with the wheel and zooms with the graph's own zoom-in control
const zoomToDealGraph = (locale: ContentLocale) => async (page: Page) => {
  const group = page.locator(`.react-flow__node[data-id="sublists:${DEMO_DEFAULT_RECORD_TYPE_IDS[locale].deals}"]`);
  const pane = await page.locator(".react-flow").first().boundingBox();
  if (!pane) throw new Error(`${page.url()}: the graph is not visible`);
  // the graph controls sit bottom left, zoom in on top; their labels are translated, so the button is found by position
  await page.evaluate(() => {
    const controls = Array.from(document.querySelectorAll<HTMLElement>('main button[data-size="icon-sm"][data-variant="secondary"]'))
      .filter((button) => button.getBoundingClientRect().left < 480 && button.getBoundingClientRect().top > window.innerHeight / 2)
      .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top);
    controls[0]?.setAttribute("data-capture-zoom-in", "");
  });
  const zoomIn = page.locator("[data-capture-zoom-in]");
  const centre = async () => {
    for (let pass = 0; pass < 4; pass++) {
      const box = await group.boundingBox();
      if (!box) throw new Error(`${page.url()}: the deals group is not visible`);
      const dx = box.x + box.width / 2 - (pane.x + pane.width / 2);
      const dy = box.y + box.height / 2 - (pane.y + pane.height / 2);
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return box;
      await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height / 2);
      await page.mouse.wheel(dx, dy);
      await page.waitForTimeout(350);
    }
    return (await group.boundingBox())!;
  };
  for (let step = 0; step < 8 && (await centre()).width < pane.width * 0.72; step++) {
    await zoomIn.click();
    await page.waitForTimeout(400);
  }
  await centre();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(600);
};

async function scrollThreadTo(page: Page, end: "bottom" | "top"): Promise<void> {
  await page.evaluate((end) => {
    for (const node of Array.from(document.querySelectorAll("main *")))
      if (node.scrollHeight > node.clientHeight + 40 && getComputedStyle(node).overflowY !== "visible") node.scrollTop = end === "top" ? 0 : node.scrollHeight;
  }, end);
  await page.waitForTimeout(600);
  await page.locator("main button[aria-label*='atest'], main button[aria-label*='ottom']").evaluateAll((nodes) => nodes.forEach((node) => node.remove()));
}

const SHOTS: Shot[] = [
  { name: "homepage-dashboard", route: route("dashboard"), viewport: DESKTOP },
  { name: "homepage-dashboard-mobile", route: route("dashboard"), viewport: PHONE },
  {
    name: "homepage-inbox",
    prepare: (page) => openThread(page, THREAD.whatsapp),
    route: route("inbox"),
    viewport: DESKTOP,
  },
  {
    name: "homepage-inbox-mobile",
    prepare: (page) => openThread(page, THREAD.whatsapp),
    route: route("inbox"),
    viewport: PHONE,
  },
  {
    name: "homepage-record",
    prepare: (page) => openRow(page, PARTNER_ROW),
    route: records("contacts"),
    viewport: DESKTOP,
  },
  {
    name: "homepage-record-mobile",
    prepare: (page) => openRow(page, PARTNER_ROW),
    route: records("contacts"),
    viewport: PHONE,
  },
  {
    name: "homepage-pipeline",
    prepare: openPipelineView,
    route: records("deals"),
    viewport: DESKTOP,
  },
  {
    // a phone board sizes its columns to the screen so the next one always peeks in; the still is the first whole column
    clip: async (page) => boardColumns(page, 1),
    within: (page) => page.locator("main [data-group-key]").first().locator("xpath=.."),
    gutter: 6,
    name: "homepage-pipeline-mobile",
    prepare: openPipelineView,
    route: records("deals"),
    viewport: PHONE,
  },
  { name: "homepage-routines", route: route("routines"), viewport: DESKTOP },
  { fitWidth: ownerColumnEdge, name: "homepage-routines-mobile", route: route("routines"), viewport: PHONE },
  { name: "homepage-configure", prepare: (page, locale) => zoomToDealGraph(locale)(page), route: route("configure"), viewport: DESKTOP },
  { name: "homepage-configure-mobile", prepare: (page, locale) => zoomToDealGraph(locale)(page), route: route("configure"), viewport: PHONE },
  {
    // the unified inbox section: the whole inbox panel (list and thread), sidebar collapsed
    clip: async (page) => [page.locator("[data-slot='sidebar-inset']").first()],
    name: "homepage-thread-linkedin",
    prepare: async (page) => {
      await openThread(page, THREAD.linkedin);
      await scrollThreadTo(page, "top");
    },
    route: route("inbox"),
    viewport: NARROW,
  },
  {
    // the human control section: the customer's message and the saved reply draft, whole cards only
    clip: async (page) => {
      // whole rows (card and avatar) of the last two messages, across the full width of the message column
      const rows = page.locator("main [data-email-header]").locator("xpath=../../..");
      const count = await rows.count();
      // and the date separator right above them, whole
      return [rows.nth(count - 2).locator("xpath=preceding-sibling::*[1]"), rows.nth(count - 2), rows.nth(count - 1)];
    },
    name: "homepage-draft",
    gutter: 0,
    prepare: async (page) => {
      await openThread(page, THREAD.draft);
      await scrollThreadTo(page, "bottom");
      await markDraft(page);
    },
    route: route("inbox"),
    viewport: DESKTOP,
  },
  {
    // the pipeline section: the first four whole board columns, from their headers to their last card
    clip: async (page) => boardColumns(page, 4),
    within: (page) => page.locator("main [data-group-key]").first().locator("xpath=.."),
    gutter: 6,
    name: "homepage-pipeline-board",
    prepare: openPipelineView,
    route: records("deals"),
    viewport: DESKTOP_WIDE,
  },
  {
    // the routines section: the list header and the whole routines table
    // header cells and rows up to the Last run column, cut on that column's edge, so the table reads at the section width
    clip: async (page) => {
      const headers = page.locator("main table thead th");
      const labels = await headers.allInnerTexts();
      const end = labels.findIndex((label) => /last run|letzter lauf/iu.test(label));
      const keep = end > 0 ? end : labels.length;
      return Array.from({ length: keep }, (_, index) => page.locator(`main table tr > :nth-child(${index + 1})`)).flatMap((cells) => [cells.first(), cells.last()]);
    },
    gutter: 0,
    name: "homepage-routines-table",
    route: route("routines"),
    viewport: DESKTOP,
  },
];

// a still never shows a loading skeleton or a toast; toasts dismiss themselves (switching a view in demo mode raises one)
async function assertSettled(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.querySelectorAll('main [data-slot="skeleton"], main .animate-pulse, [data-sonner-toast]').length === 0,
    null,
    { timeout: 45_000 },
  );
}

async function unionBox(page: Page, nodes: Locator[], gutter = GUTTER, within?: Locator) {
  const boxes = await Promise.all(nodes.map((node) => node.boundingBox()));
  if (boxes.some((box) => !box)) throw new Error(`${page.url()}: a clip element is not visible`);
  const surface = within ? await within.boundingBox() : null;
  const left = Math.max(surface?.x ?? 0, Math.min(...boxes.map((box) => box!.x)) - gutter);
  const top = Math.max(surface?.y ?? 0, Math.min(...boxes.map((box) => box!.y)) - gutter);
  const right = Math.max(...boxes.map((box) => box!.x + box!.width)) + gutter;
  const bottom = Math.max(...boxes.map((box) => box!.y + box!.height)) + gutter;
  const viewport = page.viewportSize()!;
  const x = Math.max(0, Math.round(left));
  const y = Math.max(0, Math.round(top));
  return { height: Math.min(viewport.height, Math.round(bottom)) - y, width: Math.min(viewport.width, Math.round(right)) - x, x, y };
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index > 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const baseUrl = (argValue("--base-url") ?? "http://127.0.0.1:3000").replace(/\/+$/u, "");
  if (!isLoopbackBaseUrl(baseUrl)) throw new Error(`--base-url must point at a local demo instance, got ${baseUrl}`);
  const only = argValue("--only")?.split(",") ?? [];
  const browser = await chromium.launch();
  const results: Record<string, { height: number; sha256: string; width: number }> = {};
  const versions: Record<string, Partial<Record<ContentLocale, Partial<Record<Theme, string>>>>> = structuredClone(captureVersions);

  try {
    for (const shot of SHOTS.filter((item) => only.length === 0 || only.includes(item.name)))
      for (const locale of CONTENT_LOCALES)
        for (const theme of ["light", "dark"] as const) {
          const key = `${theme}/${shot.name}-${locale}`;
          await withRetries(key, async () => {
            const context = await newCaptureContext(browser, { locale, theme, timeZone: workspaceTimeZone(SOLUTION.id, locale) }, shot.viewport);
            try {
              const page = await openReadyPage(context, baseUrl, key, shot.route(locale));
              await closeAgentPanel(page);
              await shot.prepare?.(page, locale);
              await page.mouse.move(0, 0);
              await page.waitForTimeout(500);
              await assertSettled(page);
              if (shot.fitWidth) {
                await page.setViewportSize({ height: shot.viewport.height, width: await shot.fitWidth(page) });
                await page.waitForTimeout(600);
                await assertSettled(page);
              }
              const clip = shot.clip ? await unionBox(page, await shot.clip(page), shot.gutter, shot.within?.(page)) : undefined;
              const png = await page.screenshot({ animations: "disabled", caret: "hide", clip, type: "png" });
              const file = join(process.cwd(), "public", "captures", theme, `${shot.name}-${locale}.png`);
              mkdirSync(dirname(file), { recursive: true });
              writeFileSync(file, new Uint8Array(png));
              const width = png.readUInt32BE(16);
              const height = png.readUInt32BE(20);
              results[key] = { height, sha256: sha256(png), width };
              const version = (versions[shot.name] ??= {});
              (version[locale] ??= {})[theme] = results[key].sha256.slice(0, 12);
              console.error(`captured ${key} ${width}x${height}`);
            } finally {
              await context.close();
            }
          });
        }
  } finally {
    await browser.close();
  }
  writeFileSync(
    join(process.cwd(), "app", "[locale]", "(static)", "components", "homepage-capture-versions.json"),
    `${JSON.stringify(versions, null, 2)}\n`,
  );
  console.log(JSON.stringify(results, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
