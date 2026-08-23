import { readdirSync } from "node:fs";
import { writeFileSync } from "node:fs";

const BEFORE = process.env.BEFORE_ORIGIN ?? "http://localhost:4003";
const AFTER = process.env.AFTER_ORIGIN ?? "http://localhost:4002";
const REPORT = process.env.REPORT ?? "";

const ROUTES = [
  ["for-pages", "/for"],
  ["compare-pages", "/compare"],
  ["feature-pages", "/features"],
];
const LOCALES = ["en", "de"];

function slugs(collection) {
  return readdirSync(`content/${collection}/en`)
    .filter((name) => name.endsWith(".mdx"))
    .map((name) => name.replace(/\.mdx$/u, ""));
}

// The table of contents is a derived index of the body's own headings, so a heading that
// legitimately moves out of the body takes its index entry with it. Comparing it would
// count the same words twice and report a structural change as lost content.
function withoutTableOfContents(html) {
  return html.replace(/<aside\b[\s\S]*?<\/aside>/giu, " ");
}

function documentBody(html) {
  const open = html.search(/<body\b/u);
  if (open < 0) return html;
  const close = html.lastIndexOf("</body>");
  return close > open ? html.slice(open, close) : html.slice(open);
}

function words(html) {
  return withoutTableOfContents(documentBody(html))
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<style[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&quot;/gu, '"')
    .replace(/&#x27;|&#39;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/\s+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function hrefs(html) {
  return [...withoutTableOfContents(documentBody(html)).matchAll(/href="([^"]+)"/gu)]
    .map((match) => match[1])
    .filter((href) => href.startsWith("/") || href.startsWith("http"))
    .map((href) => href.replace(/^https?:\/\/[^/]+/u, ""));
}

function counted(values) {
  const map = new Map();
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  return map;
}

function missing(before, after) {
  const a = counted(before);
  const b = counted(after);
  const lost = [];
  for (const [value, count] of a) {
    const kept = b.get(value) ?? 0;
    if (kept < count) lost.push(`${value} (${count - kept}x)`);
  }
  return lost;
}

const failures = [];
const rows = [];

for (const [collection, base] of ROUTES) {
  for (const slug of slugs(collection)) {
    for (const locale of LOCALES) {
      const path = `/${locale}${base}/${slug}`;
      const [beforeRes, afterRes] = await Promise.all([fetch(BEFORE + path), fetch(AFTER + path)]);
      if (!beforeRes.ok || !afterRes.ok) {
        failures.push(`${path}: status ${beforeRes.status} -> ${afterRes.status}`);
        continue;
      }
      const [beforeHtml, afterHtml] = await Promise.all([beforeRes.text(), afterRes.text()]);

      const lostWords = missing(words(beforeHtml), words(afterHtml));
      const lostHrefs = missing(hrefs(beforeHtml), hrefs(afterHtml));

      rows.push({ path, lostWords: lostWords.length, lostHrefs: lostHrefs.length });
      if (lostWords.length) failures.push(`${path}: ${lostWords.length} words lost -> ${lostWords.slice(0, 8).join(", ")}`);
      if (lostHrefs.length) failures.push(`${path}: ${lostHrefs.length} links lost -> ${lostHrefs.slice(0, 8).join(", ")}`);
    }
  }
}

console.log(`checked ${rows.length} pages`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
console.log(failures.length ? `${failures.length} failures` : "no word or link was lost");
if (REPORT) writeFileSync(REPORT, JSON.stringify({ checked: rows.length, failures, rows }, null, 2));
process.exit(failures.length ? 1 : 0);
