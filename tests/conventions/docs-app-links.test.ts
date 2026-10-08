import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { AGENT_UI_TARGETS } from "@/ee/agent-chat/ui-targets";
import { appLinkHrefs, parseAppLink } from "@/features/docs/app-links";
import { CONTENT_LOCALES } from "@/i18n/locale-registry";

import { REPO_ROOT, walkFiles } from "./walk";

/**
 * Product docs name every place in the app as an inline link where the text mentions it,
 * using one app link format (`[Contacts](app:records/contact)`, with an optional `?focus=`).
 * The same text serves the docs site, raw docs and Mate, so the old trailing **Link:** and
 * **Mate:** blocks, DOM ids and UI target strings have no place in the prose, and every app
 * link must resolve in features/docs/app-links.ts.
 *
 * NOT_YET_CONVERTED lists pages still written the old way. It may only shrink: a listed page
 * that no longer violates the convention fails until it is removed from the list.
 */
const NOT_YET_CONVERTED = new Set<string>([
  "de/api-keys",
  "de/app-assistant",
  "de/app-company",
  "de/app-dashboard",
  "de/app-inbox",
  "de/app-onboarding",
  "de/app-profile",
  "de/app-records",
  "de/app-routines",
  "de/app-search",
  "de/architecture-security",
  "de/concepts",
  "de/connect-cli",
  "de/connect-custom-connector",
  "de/mcp",
  "de/messaging-rate-limits",
  "de/n8n",
  "de/quickstart",
  "de/self-hosting",
  "de/webhooks",
  "en/api-keys",
  "en/app-assistant",
  "en/app-company",
  "en/app-dashboard",
  "en/app-inbox",
  "en/app-onboarding",
  "en/app-profile",
  "en/app-records",
  "en/app-routines",
  "en/app-search",
  "en/architecture-security",
  "en/concepts",
  "en/connect-cli",
  "en/connect-custom-connector",
  "en/mcp",
  "en/messaging-rate-limits",
  "en/n8n",
  "en/quickstart",
  "en/self-hosting",
  "en/webhooks",
]);

const LINK_BLOCK = /\*\*(?:Link|Mate):\*\*/;
const DOM_ID = /(?<![\w/(\[#])#[a-z][a-z0-9]*(?:-[a-z0-9]+)+/;
const UI_TARGET_PATTERN = /`(?:nav-[A-Za-z0-9:<>{}-]+|records:[^`\s]+)`/;
const UI_TARGET_IDS = new Set(AGENT_UI_TARGETS.map((target) => target.id));
const APP_ROUTE_SECTIONS = [
  ...new Set(
    AGENT_UI_TARGETS.filter((target) => target.route.startsWith("/")).map((target) => target.route.split("/")[1]),
  ),
  "records",
  "open",
];
const BARE_APP_ROUTE = new RegExp(`\`/(?:${APP_ROUTE_SECTIONS.join("|")})(?:[/?][^\`]*)?\``);
const ANY_APP_LINK = /(?<![\w-])app:[a-z]/;

type DocsPage = { key: string; file: string; text: string };

function prose(text: string) {
  return text.replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1/gm, "");
}

function docsPages(): DocsPage[] {
  return walkFiles(join(REPO_ROOT, "content", "docs"), (path) => path.endsWith(".mdx")).map((file) => ({
    key: `${basename(dirname(file))}/${basename(file, ".mdx")}`,
    file,
    text: readFileSync(file, "utf8"),
  }));
}

export function appLinkViolations(text: string): string[] {
  const found: string[] = [];
  prose(text)
    .split("\n")
    .forEach((line, index) => {
      const at = `${index + 1}: ${line.trim().slice(0, 100)}`;
      if (LINK_BLOCK.test(line)) found.push(`Link/Mate block, ${at}`);
      if (DOM_ID.test(line)) found.push(`DOM id ${DOM_ID.exec(line)?.[0]}, ${at}`);
      if (UI_TARGET_PATTERN.test(line)) found.push(`UI target ${UI_TARGET_PATTERN.exec(line)?.[0]}, ${at}`);
      for (const code of line.matchAll(/`([^`\s]+)`/g))
        if (UI_TARGET_IDS.has(code[1])) found.push(`UI target \`${code[1]}\`, ${at}`);
      if (BARE_APP_ROUTE.test(line)) found.push(`bare app route ${BARE_APP_ROUTE.exec(line)?.[0]}, ${at}`);
      for (const href of appLinkHrefs(line)) if (!parseAppLink(href)) found.push(`unresolved ${href}, ${at}`);
      if (ANY_APP_LINK.test(line.replace(/\]\(app:[^)\s]*\)/g, "")))
        found.push(`app link outside the [text](app:...) form, ${at}`);
    });
  return found;
}

describe("docs app links", () => {
  const pages = docsPages();

  it("reads the docs corpus in every content locale", () => {
    for (const locale of CONTENT_LOCALES)
      expect(pages.filter((page) => page.key.startsWith(`${locale}/`)).length).toBeGreaterThan(20);
  });

  it("writes converted pages with inline app links only", () => {
    const violations = pages
      .filter((page) => !NOT_YET_CONVERTED.has(page.key))
      .flatMap((page) => appLinkViolations(page.text).map((violation) => `${page.key}:${violation}`));

    expect(violations).toEqual([]);
  });

  it("only shrinks the list of pages not yet converted", () => {
    const converted = [...NOT_YET_CONVERTED].filter((key) => {
      const page = pages.find((candidate) => candidate.key === key);
      return !page || appLinkViolations(page.text).length === 0;
    });

    expect(converted, "Remove these pages from NOT_YET_CONVERTED").toEqual([]);
  });

  it("resolves every app link on every page", () => {
    const unresolved = pages.flatMap((page) =>
      appLinkHrefs(page.text)
        .filter((href) => !parseAppLink(href))
        .map((href) => `${page.key}: ${href}`),
    );

    expect(unresolved).toEqual([]);
  });

  it("links the same places in every locale of a page", () => {
    const linkSets = new Map<string, Map<string, string>>();
    for (const page of pages) {
      const [locale, slug] = page.key.split("/");
      const places = [...new Set(appLinkHrefs(prose(page.text)))].sort().join("\n");
      linkSets.set(slug, (linkSets.get(slug) ?? new Map()).set(locale, places));
    }
    const mismatched = [...linkSets]
      .filter(([, byLocale]) => new Set(byLocale.values()).size > 1)
      .map(([slug]) => slug);

    expect(mismatched).toEqual([]);
  });

  it("recognizes each kind of violation and passes a converted paragraph", () => {
    expect(appLinkViolations("**Link:** the Roles page.")).toHaveLength(1);
    expect(appLinkViolations("Search uses `#records-search`.")).toHaveLength(1);
    expect(appLinkViolations("Navigate with `nav-records:<typeId>`.")).toHaveLength(1);
    expect(appLinkViolations("Highlight `settings-roles-add`.")).toHaveLength(1);
    expect(appLinkViolations("Open [Projects](app:records/project).")).toHaveLength(1);
    expect(appLinkViolations("Open `/settings/roles` or `/records/<typeId>`.")).toHaveLength(1);
    expect(appLinkViolations('Open [Roles](app:settings/roles "Roles").')).toHaveLength(1);
    expect(appLinkViolations("The API lives at `/v1/records`.")).toEqual([]);
    expect(
      appLinkViolations(
        "To add a contact, open [Contacts](app:records/contact) and click [Add](app:records/contact?focus=add). See [records](/docs/app-records#how-do-i-add-a-record).\n\n## Heading [#heading-anchor]",
      ),
    ).toEqual([]);
    expect(appLinkViolations("```\n#records-search\n```")).toEqual([]);
    expect(appLinkViolations('1. Step\n   ```json\n   {"id": "#records-search"}\n   ```')).toEqual([]);
  });
});
