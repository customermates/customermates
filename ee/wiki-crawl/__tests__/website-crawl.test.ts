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
  robotsFromFetch,
  WIKI_CRAWL_MAX_LLMS_LINKS,
  WIKI_CRAWL_MAX_ROBOTS_RULES,
  WIKI_CRAWL_MAX_ROBOTS_WILDCARDS,
  wikiCrawlCategory,
} from "../website-discovery";
import { extractWikiSourceDocument } from "../website-source-extract";
import { isExternalHelpHost, isSkippedCrawlPath } from "../website-url-vocabulary";

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

describe("website page identity", () => {
  it.each(["", "   "])("preserves the heading fallback for an empty document title: %j", (title) => {
    const html = `<html><head><title>${title}</title></head><body><h1>Company</h1><h1>Products</h1></body></html>`;
    expect(extractWikiSourceDocument(html, "https://example.com", "text/html").title).toBe("Company");
  });

  it("uses the document title when multiple H1s make the first heading ambiguous", () => {
    const html = `<html><head><title>Data Science &amp; Analytics</title></head><body>
      <div><h1>Publications</h1><h1>Careers</h1><h1>Product A</h1></div>
      <div><h1>Data Science</h1><p>We build analytics and machine learning systems.</p></div>
      </body></html>`;
    const document = extractWikiSourceDocument(html, "https://example.com/data-science", "text/html");
    expect(document.title).toBe("Data Science & Analytics");
    expect(document.text).toContain("We build analytics and machine learning systems.");
  });
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

  it("matches a pathological wildcard pattern in linear time", () => {
    const path = `/${"a".repeat(20_000)}b`;
    const hostile = parseRobots(`User-agent: *\nDisallow: /${"*a".repeat(15)}*c$\nAllow: /${"*a".repeat(500)}`);
    const started = performance.now();
    for (let index = 0; index < 200; index++) expect(hostile.allows(path)).toBe(true);
    expect(performance.now() - started).toBeLessThan(1_000);

    const anchored = parseRobots(`User-agent: *\nDisallow: /${"*a".repeat(15)}*b$`);
    expect(anchored.allows(path)).toBe(false);
    expect(anchored.allows(`${path}c`)).toBe(true);
  });

  it("widens an over-wildcarded Disallow to its literal prefix and ignores an over-wildcarded Allow", () => {
    const wildcards = "*x".repeat(WIKI_CRAWL_MAX_ROBOTS_WILDCARDS + 1);
    const rules = parseRobots(
      `User-agent: *\nDisallow: /docs/${wildcards}\nAllow: /open/${wildcards}\nDisallow: /open/`,
    );
    expect(rules.allows("/docs/anything")).toBe(false);
    expect(rules.allows("/open/xx")).toBe(false);
    expect(rules.allows("/pricing")).toBe(true);
  });

  it("stops reading rules after the rule cap", () => {
    const filler = Array.from({ length: WIKI_CRAWL_MAX_ROBOTS_RULES }, (_, index) => `Disallow: /f${index}`);
    const rules = parseRobots(["User-agent: *", ...filler, "Disallow: /late"].join("\n"));
    expect(rules.allows("/f0")).toBe(false);
    expect(rules.allows("/late")).toBe(true);
  });

  it("treats an unreachable robots.txt as disallow-all and a missing one as allow-all, per RFC 9309", () => {
    expect(robotsFromFetch({ ok: false, reason: "unavailable", status: 503 })).toMatchObject({ blocked: true });
    expect(robotsFromFetch({ ok: false, reason: "unavailable", status: 500 }).allows("/help")).toBe(false);
    expect(robotsFromFetch({ ok: false, reason: "timeout" }).blocked).toBe(true);
    expect(robotsFromFetch({ ok: false, reason: "blocked_address" }).blocked).toBe(true);
    for (const status of [400, 401, 403, 404, 410, 429])
      expect(robotsFromFetch({ ok: false, reason: "unavailable", status }).blocked).toBe(false);
    expect(robotsFromFetch({ ok: false, reason: "redirect_limit" }).blocked).toBe(false);
    expect(robotsFromFetch({ ok: true, body: "User-agent: *\nDisallow: /" }).blocked).toBe(true);
  });

  it("parses a robots.txt cut at 500 KiB up to its last complete line instead of disallowing everything", () => {
    const truncated = robotsFromFetch({
      ok: true,
      body: "User-agent: *\nDisallow: /private\nDisallow: /par",
      truncated: true,
    });
    expect(truncated.blocked).toBe(false);
    expect(truncated.allows("/private/page")).toBe(false);
    expect(truncated.allows("/partners")).toBe(true);
    expect(
      robotsFromFetch({ ok: true, body: "User-agent: *\nDisallow: /par", truncated: false }).allows("/partners"),
    ).toBe(false);
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

  it("caps the links it takes from llms.txt", () => {
    const markdown = Array.from({ length: WIKI_CRAWL_MAX_LLMS_LINKS + 50 }, (_, index) => `- [P${index}](/p${index})`);
    const links = parseLlmsTxt(markdown.join("\n"), "https://example.com");
    expect(links).toHaveLength(WIKI_CRAWL_MAX_LLMS_LINKS);
    expect(links.at(-1)).toEqual({
      url: `https://example.com/p${WIKI_CRAWL_MAX_LLMS_LINKS - 1}`,
      title: `P${WIKI_CRAWL_MAX_LLMS_LINKS - 1}`,
    });
  });

  it("categorises a path with a stray percent sign instead of throwing", () => {
    expect(wikiCrawlCategory("https://example.com/help/100%-sure")).toBe("help");
    expect(wikiCrawlCategory("https://example.com/%E0%A4%A")).toBe("other");
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
    ["https://example.com/es/ayuda/facturas", "help"],
    ["https://example.com/fr/tarifs", "pricing"],
    ["https://example.com/it/rimborsi", "policy"],
    ["https://example.com/fr/produits/agenda", "product"],
    ["https://example.com/it/chi-siamo", "about"],
    ["https://example.com/es/clientes/acme", "customers"],
    ["https://example.com/fr/actualites/lancement", "blog"],
  ] as const)("categorises %s as %s", (url, category) => {
    expect(wikiCrawlCategory(url)).toBe(category);
  });

  it("skips account, cart and career paths and file downloads, and spots hosted help centres", () => {
    for (const path of ["/login", "/de/warenkorb", "/es/empleo", "/it/lavora-con-noi", "/wp-json/x", "/guide.pdf"])
      expect(isSkippedCrawlPath(path), path).toBe(true);
    expect(isSkippedCrawlPath("/help/login-issues")).toBe(false);
    expect(isExternalHelpHost("acme.zendesk.com")).toBe(true);
    expect(isExternalHelpHost("hilfe.acme.de")).toBe(true);
    expect(isExternalHelpHost("zendeskXcom.acme.de")).toBe(false);
    expect(isExternalHelpHost("www.acme.com")).toBe(false);
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

  it("stops when robots.txt is unreachable and imports normally when it is missing", async () => {
    routes.set("https://example.com/robots.txt", { status: 503, type: "text/plain", body: "busy" });
    expect(await discoverWikiWebsite({ homepage: "https://example.com", locale: "en", scope })).toEqual({
      status: "blocked",
    });
    expect(mocks.requested).toHaveLength(1);

    routes.set("https://example.com/robots.txt", { status: 404, type: "text/plain", body: "missing" });
    routes.set("https://example.com/", { body: "<main><h1>Acme</h1></main>" });
    expect(await discoverWikiWebsite({ homepage: "https://example.com", locale: "en", scope })).toMatchObject({
      status: "ready",
    });
  });

  it("checks the same path and query in discovery as when it fetches", async () => {
    routes.set("https://example.com/robots.txt", { type: "text/plain", body: "User-agent: *\nDisallow: /*?lang=" });
    routes.set("https://example.com/", {
      body: '<main><h1>Acme</h1><a href="/help?lang=de">Hilfe</a><a href="/pricing">Pricing</a></main>',
    });
    const discovery = await discoverWikiWebsite({ homepage: "https://example.com", locale: "en", scope });
    if (discovery.status !== "ready") throw new Error("discovery failed");
    expect(discovery.targets.map(({ url }) => url)).toEqual(["https://example.com/", "https://example.com/pricing"]);
    const robots = new WikiCrawlRobots(scope);
    expect(await robots.allows("https://example.com/help?lang=de")).toBe(false);
  });
});
