import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

import {
  BookOpen,
  Bot,
  Boxes,
  BriefcaseBusiness,
  Building2,
  Cable,
  CheckCircle2,
  GitCompareArrows,
  Github,
  HeartPulse,
  Inbox,
  LayoutGrid,
  Megaphone,
  Plug,
  Presentation,
  Rocket,
  Server,
  Store,
  TrendingUp,
  UserRoundSearch,
  Users,
  UsersRound,
} from "lucide-react";
import { describe, expect, it } from "vitest";

import { resolvePublicNavGroups } from "@/app/components/navigation/public-navbar-model";

const REPO_ROOT = process.cwd();

const HEADER_SHELLS = {
  navbar: "app/components/public-navbar.tsx",
  docsTopBar: "app/[locale]/(static)/docs/components/docs-topbar.tsx",
} as const;

const FOOTER = "app/components/footer-content.tsx";

function read(file: string): string {
  return readFileSync(join(REPO_ROOT, file), "utf8");
}

const translationKey = ((key: string) => key) as unknown as Parameters<typeof resolvePublicNavGroups>[0];
const publicNavGroups = resolvePublicNavGroups(translationKey);

function publicNavGroup(id: string) {
  const group = publicNavGroups.find((candidate) => candidate.id === id);
  if (!group) throw new Error(`public navigation group ${id} is missing`);

  return group;
}

function sourceFiles(): string[] {
  const found: string[] = [];
  const skip = new Set(["node_modules", ".next", ".git", "generated"]);

  function walk(directory: string) {
    for (const entry of readdirSync(directory)) {
      if (skip.has(entry)) continue;
      const full = join(directory, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if ([".ts", ".tsx"].includes(extname(entry))) found.push(full);
    }
  }

  for (const top of ["app", "components", "core", "features", "ee"]) {
    const directory = resolve(REPO_ROOT, top);
    if (existsSync(directory)) walk(directory);
  }

  return found;
}

describe("public navigation preferences", () => {
  it("offers both preference controls in every public shell", () => {
    const navbar = read(HEADER_SHELLS.navbar);

    expect(navbar.match(/<LocaleMenu/g)).toHaveLength(1);
    expect(navbar.match(/<ThemeSwitcher/g)).toHaveLength(1);
    expect(navbar.match(/\{renderPreferenceButtons\(\)\}/g)).toHaveLength(2);
    expect(navbar).toContain(
      'className="hidden items-center gap-1 justify-self-end xl:flex"',
    );
    expect(navbar).toContain(
      'className="col-span-3 flex w-full items-center justify-between xl:hidden"',
    );
    expect(navbar).toContain('className="my-1 py-3"');
    expect(navbar).not.toContain("border-y");
    expect(navbar).not.toContain("github.com/customermates/customermates");

    // The docs tree renders its own header rather than the public navbar, so without this it is the
    // one public surface with no way to change language or theme at all. Between them the two header
    // shells cover every URL in the sitemap.
    for (const [name, file] of Object.entries(HEADER_SHELLS)) {
      const source = read(file);
      expect(source, `${name} is missing the locale menu`).toContain(
        "<LocaleMenu",
      );
      expect(source, `${name} is missing the theme switcher`).toContain(
        "<ThemeSwitcher",
      );
    }

    // CUS-202 stripped duplicate preference controls from the footer. The two header shells still
    // own those controls, while the footer remains free to carry curated marketing links.
    const footer = read(FOOTER);
    expect(footer, "the header menu already links every locale").not.toContain(
      "<LocaleMenu",
    );
    expect(
      footer,
      "the theme switcher belongs to the header shells",
    ).not.toContain("<ThemeSwitcher");
    for (const href of [
      "https://viesearch.com/",
      "https://www.promotebusinessdirectory.com/",
      "https://www.usawebsitesdirectory.com/computers_and_internet/",
      "https://www.bestsitesindex.com/submit.php",
    ]) {
      expect(footer, `${href} is missing below the Featured On rail`).toContain(href);
    }
    expect(footer.indexOf("<FooterBadges />")).toBeLessThan(footer.indexOf("https://viesearch.com/"));
    expect(footer, "comparison details belong behind the comparison hub").not.toContain("CompetitorLinks");
    expect(footer, "the resource column should use concise directory labels").toContain(
      't("NavigationBar.public.articlesAndGuides")',
    );
    expect(footer, "the resource column should expose one comparison directory link").toContain(
      't("NavigationBar.public.compare")',
    );
    expect(footer).not.toContain('t("Footer.blogViewAll")');
    expect(footer).not.toContain('t("Footer.compareViewAll")');
  });

  it("keeps the flat marketing map restrained", () => {
    const groupShape = publicNavGroups.map((group) => [
      group.id,
      group.activeHref,
      group.columns,
      group.icon,
      group.title,
    ]);
    expect(groupShape).toEqual([
      ["product", "/features", 3, Boxes, "NavigationBar.public.product"],
      ["solutions", "/for", 3, UsersRound, "NavigationBar.public.solutions"],
      ["integrations", "/features/integrations", 2, Plug, "NavigationBar.public.integrations"],
      ["resources", "/blog", 2, BookOpen, "NavigationBar.public.resources"],
    ]);

    const hrefs = publicNavGroups.flatMap((group) => group.links.map((link) => link.href));
    for (const href of [
      "/blog/agentic-crm",
      "/blog/open-source-crm",
      "/features/self-hosted",
      "/features/unified-inbox",
      "/for/agencies",
      "/for/professional-services",
    ]) {
      expect(hrefs, `${href} is missing from the sitewide navigation`).toContain(href);
    }
    expect(hrefs, "the integrations group has no hub page of its own").not.toContain("/features/integrations");

    for (const group of publicNavGroups) {
      expect(Object.keys(group).sort()).toEqual(["activeHref", "columns", "icon", "id", "links", "title"]);
      for (const link of group.links) {
        expect(
          ["activeMatch", "href", "icon", "mark", "title"],
          `${link.href} carries a field the flat map does not render`,
        ).toEqual(expect.arrayContaining(Object.keys(link)));
      }
    }
    expect(publicNavGroups.flatMap((group) => group.links.map((link) => link.title))).not.toContain(
      "NavigationBar.public.allIntegrations",
    );

    const iconLinks = (id: string) => publicNavGroup(id).links.map((link) => [link.href, link.icon]);
    expect(iconLinks("product")).toEqual([
      ["/features/unified-inbox", Inbox],
      ["/features/contact-management", Users],
      ["/features/pipeline", TrendingUp],
      ["/features/sales-tracking", TrendingUp],
      ["/features/task-management", CheckCircle2],
      ["/features/cloud-crm", LayoutGrid],
      ["/features/self-hosted", Server],
      ["/docs/mcp", Cable],
      ["/features/all", Boxes],
    ]);
    expect(iconLinks("solutions")).toEqual([
      ["/for/professional-services", BriefcaseBusiness],
      ["/for/agencies", Megaphone],
      ["/for/consultants", Presentation],
      ["/for/recruiting", UserRoundSearch],
      ["/for/healthcare", HeartPulse],
      ["/for/property-management", Building2],
      ["/for/startups", Rocket],
      ["/for/smb", Store],
      ["/for", UsersRound],
    ]);
    expect(iconLinks("resources")).toEqual([
      ["/blog", BookOpen],
      ["/compare", GitCompareArrows],
      ["/blog/agentic-crm", Bot],
      ["/blog/open-source-crm", Github],
    ]);

    const integrations = publicNavGroup("integrations").links;
    expect(integrations.every((link) => link.icon === undefined)).toBe(true);
    expect(integrations.map((link) => [link.mark, link.title])).toEqual([
      [{ kind: "agent", provider: "claude" }, "NavigationBar.public.providerClaude"],
      [{ kind: "agent", provider: "chatgpt" }, "NavigationBar.public.providerChatGPT"],
      [{ kind: "agent", provider: "codex" }, "NavigationBar.public.providerCodex"],
      [{ kind: "agent", provider: "gemini" }, "NavigationBar.public.providerGemini"],
      [{ kind: "agent", provider: "cursor" }, "NavigationBar.public.providerCursor"],
      [{ kind: "channel", provider: "gmail" }, "NavigationBar.public.providerGmail"],
      [{ kind: "channel", provider: "outlook" }, "NavigationBar.public.providerOutlook"],
      [{ kind: "channel", provider: "linkedin" }, "NavigationBar.public.providerLinkedIn"],
      [{ kind: "channel", provider: "whatsapp" }, "NavigationBar.public.providerWhatsApp"],
      [{ kind: "channel", provider: "instagram" }, "NavigationBar.public.providerInstagram"],
      [{ kind: "channel", provider: "telegram" }, "NavigationBar.public.providerTelegram"],
      [{ kind: "channel", provider: "imap" }, "NavigationBar.public.providerImap"],
      [{ kind: "provider", provider: "slack" }, "NavigationBar.public.providerSlack"],
      [{ kind: "automation", provider: "n8n" }, "NavigationBar.public.n8n"],
    ]);
  });

  it("shares the marketing map between the desktop menu and the mobile sheet", () => {
    const navbar = read(HEADER_SHELLS.navbar);
    const menu = read("app/components/navigation/public-navbar-menu.tsx");
    const mobile = navbar.slice(navbar.indexOf("<SheetBody"), navbar.indexOf("</SheetBody>"));

    expect(navbar.match(/publicNavGroups\.map/gu)).toHaveLength(1);
    // A native disclosure ships its links in the server HTML whether or not it is open, and
    // `name` gives one-open-at-a-time without a controlled value. Radix Accordion bought the same
    // behaviour for 3.3 KB of JavaScript on every marketing page.
    expect(
      navbar,
      "the mobile disclosure has to be native to render closed",
    ).toContain("<details");
    expect(navbar, "one mobile group open at a time").toContain(
      'name="public-nav-mobile"',
    );
    expect(
      navbar,
      "a disclosure list does not need an overlay primitive",
    ).not.toContain("<Accordion");
    expect(navbar).toContain("<MarketingContainer");
    expect(menu).toContain("<Popover");
    expect(menu).toContain("<PopoverAnchor");
    expect(menu).toContain("<PopoverContent");
    expect(menu).toContain("forceMount");
    expect(menu).toContain("portalled={false}");
    expect(menu).not.toContain("NavigationMenu");
    expect(menu).not.toContain('className="fixed');
    expect(menu).not.toContain("DropdownMenu");
    expect(menu).not.toMatch(
      /bg-(?:red|orange|amber|yellow|green|blue|violet|purple)-/u,
    );

    expect(navbar.match(/t\("NavigationBar\.docs"\)/gu)).toHaveLength(2);
    expect(navbar.match(/href="\/docs"/gu)).toHaveLength(1);
    expect(navbar).toContain('isNavItemActive("/docs")');
    expect(navbar).toContain("group.links.map");
    expect(navbar).not.toContain("group.sections");
    expect(navbar).not.toContain("group.description");

    expect(menu).toContain("group.links.map");
    expect(menu).toContain('group.columns === 3 ? "grid-cols-3" : "grid-cols-2"');
    expect(menu).not.toContain("group.sections");
    expect(menu).not.toContain("group.description");
    expect(menu).not.toContain("<section");
    expect(menu).not.toContain("<footer");
    expect(menu).not.toContain("GroupIcon");
    expect(menu).toContain("<ProviderMark");
    expect(menu).toContain("<AiClientLogo");
    expect(menu).toContain("<Slack");
    expect(menu).toContain("/icons/integrations/n8n.svg");
    expect(menu).toContain("<PublicNavLinkMark mark={link.mark} />");
    expect(menu).toContain("<PublicNavLinkIcon icon={link.icon} />");
    expect(menu).toContain('data-public-nav-icon="true"');
    expect(menu).toContain('<span className="min-w-0 truncate">{link.title}</span>');
    expect(menu).not.toContain("group.featured");
    expect(menu).toContain(
      '"overflow-hidden rounded-lg border border-border bg-popover shadow-md"',
    );
    expect(menu).toContain('"grid gap-px bg-border"');
    expect(menu).toContain('"flex h-full min-h-11 items-center gap-2.5 bg-popover');
    expect(menu).toContain('href="/docs"');

    expect(mobile.match(/mobileOverviewRowClassName/gu)).toHaveLength(3);
    expect(
      mobile,
      "a group row has to look like the flat mobile links beside it",
    ).toMatch(/<summary\s+className=\{cn\(\s*mobileOverviewRowClassName/u);
    for (const href of ["/pricing", "/docs"]) {
      const hrefIndex = mobile.indexOf(`href="${href}"`);
      const linkStart = mobile.lastIndexOf("<AppLink", hrefIndex);
      expect(mobile.slice(linkStart, hrefIndex)).toContain('appearance="unstyled"');
      expect(mobile.slice(linkStart, hrefIndex)).toContain("mobileOverviewRowClassName");
      expect(mobile.slice(linkStart, hrefIndex)).toContain("border-t border-border");
    }
    expect(mobile).toContain("icon={CircleDollarSign}");
    expect(mobile).toContain("icon={FileText}");
    expect(mobile).toContain("<PublicNavLinkIcon icon={link.icon} />");
    expect(mobile).not.toContain('cn("py-3 text-base"');

    const groupsEnd = mobile.lastIndexOf("</details>");
    const pricingIndex = mobile.indexOf('href="/pricing"');
    const docsIndex = mobile.indexOf('href="/docs"');
    const preferencesIndex = mobile.indexOf("{renderPreferenceButtons()}");
    expect(groupsEnd).toBeGreaterThan(-1);
    expect(pricingIndex).toBeGreaterThan(groupsEnd);
    expect(docsIndex).toBeGreaterThan(pricingIndex);
    expect(preferencesIndex).toBeGreaterThan(docsIndex);
  });

  it("keeps the six official theme-aware Featured On badges and outbound destinations", () => {
    const badges = read("app/components/footer-badges.tsx");

    for (const href of [
      "https://www.uneed.best/tool/customermates",
      "https://sourceforge.net/software/product/Customermates/",
      "https://twelve.tools",
      "https://wired.business",
      "https://startupfa.me/s/customermates",
      "https://open-launch.com/projects/customermates",
    ]) {
      expect(
        badges,
        `${href} is missing from the Featured On proof rail`,
      ).toContain(href);
    }

    for (const badgeAsset of [
      "https://www.uneed.best/POTW1.png",
      "https://www.uneed.best/POTW1A.png",
      "https://b.sf-syn.com/badge_img/3954503/light-default?variant_id=sf",
      "https://twelve.tools/badge2-light.svg",
      "https://wired.business/badge1-dark.svg",
      "https://startupfa.me/badges/featured/light.webp",
      "https://open-launch.com/api/badge/e6753e76-e978-4100-b29f-a3048622b9a6/featured-dark.svg",
    ]) {
      expect(badges, `${badgeAsset} is missing from the official badge rail`).toContain(badgeAsset);
    }

    expect(badges).toContain("<img");
    expect(badges).toContain("useServerTheme");
    expect(badges).toContain("MARQUEE_COPIES");
    expect(badges).toContain("prefers-reduced-motion");
    expect(badges).toContain(".footer-badges-track:focus-within");
    expect(badges).toContain("transform: translateX(0) !important");
  });

  it("keeps the locale menu renderable without JavaScript", () => {
    const menu = read("components/shared/locale-menu.tsx");

    // This is the whole reason the component is purpose-built rather than assembled from the shared
    // DropdownMenu. Radix portals its content, React never renders a portal during SSR, and the
    // rendered-but-closed workaround makes Radix aria-hide the rest of the page and swallow the
    // trigger's own pointerdown. A native disclosure ships every anchor in the server HTML instead,
    // which is what lets /de be discovered by a crawler that never opens the menu.
    expect(
      menu,
      "a portalled menu ships no anchors to a crawler",
    ).not.toContain("DropdownMenu");
    expect(menu, "the disclosure has to be native to render closed").toContain(
      "<details",
    );
    expect(menu, "the trigger has to be native to render closed").toContain(
      "<summary",
    );
    expect(menu, "each locale needs a real anchor, not a button").toContain(
      "hrefLang={locale}",
    );
    expect(
      menu,
      "the anchor must resolve to this page in the other locale",
    ).toContain("buildLocalePath(locale, pathname)");
    expect(menu, "a modified click must still open a new tab").toContain(
      "event.metaKey",
    );
    expect(
      menu,
      "the unsaved-changes guard still owns same-tab navigation",
    ).toContain("navigationGuard.tryNavigate");
    expect(menu, "the trigger shows the locale it is currently on").toContain(
      "currentLocale.toUpperCase()",
    );
    // Radix Avatar resolves its source with `new Image()` to decide a loading state, so the flags
    // were fetched from flagcdn.com on every marketing page even though the disclosure is closed.
    // A lazy <img> inside a closed <details> is never requested.
    expect(menu, "the flag must not be fetched until the menu opens").toContain(
      'loading="lazy"',
    );
    expect(menu, "the flag still comes from the locale registry").toContain(
      "flagCodeFor(locale)",
    );
    // The avatar primitive also hid a flag that never loaded. A bare <img> paints the browser's
    // broken-image glyph instead, whenever a blocker or an outage stops flagcdn.com.
    expect(menu, "a flag that fails to load keeps its slot but paints nothing").toContain(
      'event.currentTarget.style.visibility = "hidden"',
    );
    expect(
      menu,
      "a portalled avatar primitive ships a request for a menu nobody opened",
    ).not.toContain("FormAutocompleteCountryItem");
  });

  it("leaves no import of the retired dropdown-based selector", () => {
    expect(
      existsSync(join(REPO_ROOT, "components/shared/language-selector.tsx")),
    ).toBe(false);

    const stragglers = sourceFiles().filter((file) =>
      readFileSync(file, "utf8").includes("language-selector"),
    );
    expect(stragglers.map((file) => file.replace(REPO_ROOT + "/", ""))).toEqual(
      [],
    );
  });

  it("toggles directly between the resolved light and dark themes", () => {
    const themeSwitcher = read("components/shared/theme-switcher.tsx");

    expect(themeSwitcher).toContain(
      'resolvedTheme === "dark" ? "dark" : "light"',
    );
    expect(themeSwitcher).toContain(
      'selectedTheme === "dark" ? "light" : "dark"',
    );
    expect(themeSwitcher).toContain(
      'import type { Theme } from "@/generated/prisma"',
    );
    expect(themeSwitcher).not.toContain(
      'import { Theme } from "@/generated/prisma"',
    );
    expect(themeSwitcher).toContain(
      '${t("Common.ariaLabels.themeSwitcher")}: ${selectedThemeLabel}',
    );
    expect(themeSwitcher).not.toContain("DropdownMenu");
  });
});
