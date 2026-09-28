import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { discoverWikiWebsite, fetchWikiSource, WikiCrawlRobots } from "../website-crawler";
import {
  canonicalCrawlUrl,
  parseLlmsTxt,
  parseRobots,
  parseSitemap,
  rankWikiCrawlTargets,
  wikiCrawlCategory,
} from "../website-discovery";
import { extractWikiSourceDocument } from "../website-source-extract";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), httpsRequest: vi.fn(), requested: [] as string[] }));

vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:https", () => ({ request: mocks.httpsRequest }));

type Route = { status?: number; type?: string; body?: string };
const routes = new Map<string, Route>();

function request(
  url: URL,
  options: { signal: AbortSignal; headers: Record<string, string> },
  callback: (value: unknown) => void,
) {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    end: () => {
      queueMicrotask(() => {
        mocks.requested.push(`${url.toString()} ${options.headers["User-Agent"]}`);
        const route = routes.get(url.toString()) ?? { status: 404, type: "text/html", body: "missing" };
        const response = Object.assign(Readable.from([route.body ?? ""]), {
          statusCode: route.status ?? 200,
          headers: { "content-type": `${route.type ?? "text/html"}; charset=utf-8` },
        });
        callback(response);
      });
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  routes.clear();
  mocks.requested.length = 0;
  mocks.lookup.mockResolvedValue([{ address: "93.184.215.14", family: 4 }]);
  mocks.httpsRequest.mockImplementation(request);
});

describe("robots.txt", () => {
  it("prefers our own group, applies the longest match with wildcards and anchors, and clamps crawl delay", () => {
    const rules = parseRobots(
      [
        "User-agent: *",
        "Disallow: /",
        "",
        "User-agent: Customermates",
        "Disallow: /private",
        "Allow: /private/help",
        "Disallow: /*.pdf$",
        "Crawl-delay: 30",
        "Sitemap: https://example.com/sitemap_index.xml",
      ].join("\n"),
    );
    expect(rules.blocked).toBe(false);
    expect(rules.allows("/pricing")).toBe(true);
    expect(rules.allows("/private/team")).toBe(false);
    expect(rules.allows("/private/help/faq")).toBe(true);
    expect(rules.allows("/files/terms.pdf")).toBe(false);
    expect(rules.allows("/files/terms.pdf?download=1")).toBe(true);
    expect(rules.crawlDelayMs).toBe(10_000);
    expect(rules.sitemaps).toEqual(["https://example.com/sitemap_index.xml"]);
  });

  it("falls back to the wildcard group and treats a missing file as allow-all", () => {
    expect(parseRobots("User-agent: *\nDisallow: /").blocked).toBe(true);
    expect(parseRobots("User-agent: Googlebot\nDisallow: /").blocked).toBe(false);
    expect(parseRobots(null)).toMatchObject({ blocked: false, crawlDelayMs: 0, sitemaps: [] });
  });
});

describe("sitemaps, llms.txt and categories", () => {
  it("parses url sets, sitemap indexes and XML entities", () => {
    expect(
      parseSitemap(
        "<urlset><url><loc>https://example.com/help?a=1&amp;b=2</loc></url><url><loc><![CDATA[https://example.com/pricing]]></loc></url></urlset>",
      ),
    ).toEqual({ urls: ["https://example.com/help?a=1&b=2", "https://example.com/pricing"], sitemaps: [] });
    expect(
      parseSitemap("<sitemapindex><sitemap><loc>https://example.com/a.xml</loc></sitemap></sitemapindex>"),
    ).toEqual({
      urls: [],
      sitemaps: ["https://example.com/a.xml"],
    });
    expect(parseLlmsTxt("# Acme\n- [Refunds](/help/refunds): how refunds work", "https://example.com")).toEqual([
      { url: "https://example.com/help/refunds", title: "Refunds" },
    ]);
  });

  it.each([
    ["https://example.com/help/getting-started", "help"],
    ["https://example.com/de/hilfe/rechnungen", "help"],
    ["https://example.com/faq", "help"],
    ["https://example.com/pricing", "pricing"],
    ["https://example.com/preise", "pricing"],
    ["https://example.com/legal/refund-policy", "policy"],
    ["https://example.com/agb", "policy"],
    ["https://example.com/features/scheduling", "product"],
    ["https://example.com/about-us", "about"],
    ["https://example.com/customers/acme", "customers"],
    ["https://example.com/blog/launch", "blog"],
    ["https://example.com/en/blog/pipedrive-pricing", "blog"],
    ["https://example.com/partners", "other"],
  ] as const)("categorises %s as %s", (url, category) => {
    expect(wikiCrawlCategory(url)).toBe(category);
  });

  it("ranks the homepage first, fills category quotas, skips junk, dedupes and prefers the workspace language", () => {
    const candidates = [
      ...Array.from({ length: 30 }, (_, index) => ({
        url: `https://example.com/help/article-${index}`,
        source: "sitemap" as const,
      })),
      ...Array.from({ length: 10 }, (_, index) => ({
        url: `https://example.com/blog/post-${index}`,
        source: "sitemap" as const,
      })),
      { url: "https://example.com/pricing?utm=x", source: "link" as const },
      { url: "https://example.com/pricing/", source: "sitemap" as const },
      { url: "https://example.com/terms", source: "link" as const },
      { url: "https://example.com/refund-policy", source: "link" as const },
      { url: "https://example.com/features", source: "link" as const },
      { url: "https://example.com/login", source: "link" as const },
      { url: "https://example.com/brochure.pdf", source: "link" as const },
      { url: "https://example.com/fr/aide/remboursement", source: "sitemap" as const },
      { url: "https://example.com/en/help/refunds", source: "sitemap" as const },
    ];
    const targets = rankWikiCrawlTargets({
      homepage: "https://example.com/",
      candidates,
      locale: "en",
      allows: (url) => !url.includes("article-29"),
    });
    const urls = targets.map(({ url }) => url);
    expect(targets).toHaveLength(40);
    expect(targets[0]).toEqual({ url: "https://example.com/", category: "about" });
    expect(urls.filter((url) => url.includes("/pricing"))).toEqual(["https://example.com/pricing"]);
    expect(urls).toEqual(
      expect.arrayContaining([
        "https://example.com/terms",
        "https://example.com/refund-policy",
        "https://example.com/features",
      ]),
    );
    expect(urls.some((url) => /login|\.pdf|article-29/u.test(url))).toBe(false);
    expect(urls.indexOf("https://example.com/en/help/refunds")).toBeLessThan(
      urls.indexOf("https://example.com/fr/aide/remboursement") >>> 0,
    );
    expect(canonicalCrawlUrl("https://Example.com/Help/index.html#top")).toBe("https://example.com/Help");
  });
});

describe("source extraction", () => {
  it("keeps main content headings as Markdown and extracts FAQ pairs from JSON-LD, details and question headings", () => {
    const html = `<html><head><title>Help | Acme</title>
      <script type="application/ld+json">{"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Can I get a refund?","acceptedAnswer":{"@type":"Answer","text":"<p>Yes, within <b>30 days</b>.</p>"}}]}</script>
      </head><body><nav><a href="/login">Login</a></nav><main>
      <h1>Help center</h1><p>Answers for customers.</p>
      <h2>How do I cancel?</h2><p>Open Billing and choose Cancel.</p>
      <details><summary>Do you offer invoices?</summary><p>Invoices arrive by email on the 1st.</p></details>
      <a href="/help/refunds">Refunds</a></main><footer>Imprint</footer></body></html>`;
    const document = extractWikiSourceDocument(html, "https://example.com/help", "text/html");
    expect(document.title).toBe("Help center");
    expect(document.text).toContain("# Help center");
    expect(document.text).toContain("## How do I cancel?");
    expect(document.text).not.toContain("Imprint");
    expect(document.text).not.toContain("Login");
    expect(document.qaPairs).toEqual([
      { question: "Can I get a refund?", answer: "Yes, within 30 days." },
      { question: "How do I cancel?", answer: "Open Billing and choose Cancel." },
      { question: "Do you offer invoices?", answer: "Invoices arrive by email on the 1st.\n\nRefunds" },
    ]);
    expect(document.links.map(({ url }) => url)).toEqual([
      "https://example.com/login",
      "https://example.com/help/refunds",
    ]);
  });
});

describe("untrusted markup", () => {
  it("decodes each entity once and turns markup into text", () => {
    expect(
      parseSitemap("<urlset><url><loc>https://example.com/a?q=&amp;lt;b&amp;gt;</loc></url></urlset>").urls,
    ).toEqual(["https://example.com/a?q=&lt;b&gt;"]);
    const html = `<html><head><script type="application/ld+json">{"@type":"Question","name":"Safe?","acceptedAnswer":{"text":"<p>Use <iframe src=x></iframe><b>bold</b> &amp;lt;script&amp;gt; ok</p>"}}</script></head><body><main><p>Body</p></main></body></html>`;
    const [pair] = extractWikiSourceDocument(html, "https://example.com/faq", "text/html").qaPairs;
    expect(pair).toEqual({ question: "Safe?", answer: "Use bold &lt;script&gt; ok" });
  });
});

describe("website discovery and fetching", () => {
  const scope = { registrableDomain: "example.com", extraHosts: [] };

  it("discovers pages from robots sitemaps, llms.txt and homepage links, identifies itself, and reports external help centres", async () => {
    routes.set("https://example.com/robots.txt", {
      type: "text/plain",
      body: "User-agent: *\nDisallow: /internal\nSitemap: https://example.com/sitemap_index.xml",
    });
    routes.set("https://example.com/", {
      body: '<html><body><main><h1>Acme</h1><a href="/pricing">Pricing</a><a href="/internal/ops">Ops</a><a href="https://acme.zendesk.com/hc">Help</a></main></body></html>',
    });
    routes.set("https://example.com/llms.txt", { type: "text/plain", body: "# Acme\n- [Refunds](/help/refunds)" });
    routes.set("https://example.com/sitemap_index.xml", {
      type: "application/xml",
      body: "<sitemapindex><sitemap><loc>https://example.com/pages.xml</loc></sitemap></sitemapindex>",
    });
    routes.set("https://example.com/pages.xml", {
      type: "application/xml",
      body: "<urlset><url><loc>https://example.com/terms</loc></url><url><loc>https://example.com/internal/secret</loc></url></urlset>",
    });

    const discovery = await discoverWikiWebsite({ homepage: "https://example.com", locale: "en", scope });
    expect(discovery).toMatchObject({ status: "ready", pendingHosts: ["acme.zendesk.com"] });
    if (discovery.status !== "ready") throw new Error("discovery failed");
    expect(discovery.targets.map(({ url }) => url)).toEqual([
      "https://example.com/",
      "https://example.com/help/refunds",
      "https://example.com/terms",
      "https://example.com/pricing",
    ]);
    expect(mocks.requested.every((line) => line.includes("Customermates/1.0 (+https://customermates.com"))).toBe(true);
    expect(mocks.requested.some((line) => line.includes("/internal"))).toBe(false);
  });

  it("stops when robots.txt blocks the whole site and never fetches disallowed pages", async () => {
    routes.set("https://example.com/robots.txt", { type: "text/plain", body: "User-agent: *\nDisallow: /" });
    expect(await discoverWikiWebsite({ homepage: "https://example.com", locale: "en", scope })).toEqual({
      status: "blocked",
    });
    expect(mocks.requested).toHaveLength(1);

    routes.set("https://example.com/robots.txt", { type: "text/plain", body: "User-agent: *\nDisallow: /private" });
    routes.set("https://example.com/help", { body: "<main><h1>Help</h1><p>Refunds within 30 days.</p></main>" });
    const robots = new WikiCrawlRobots(scope);
    expect(await fetchWikiSource("https://example.com/private/page", scope, robots)).toBeNull();
    const source = await fetchWikiSource("https://example.com/help", scope, robots);
    expect(source).toMatchObject({
      url: "https://example.com/help",
      title: "Help",
      text: "# Help\n\nRefunds within 30 days.",
    });
    expect(source?.contentHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(mocks.requested.filter((line) => line.includes("/private"))).toEqual([]);
  });
});
