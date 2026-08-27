import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const COLLECTIONS = ["for-pages", "compare-pages", "feature-pages"];
const LOCALES = ["en", "de"];

const FAQ_HEADING = /^##\s+(Frequently\s+asked\s+questions.*|Frequently\s+Asked\s+Questions.*|FAQ|Häufig\s+gestellte\s+Fragen.*)\s*$/u;
const QUESTION = /^###\s+(.+?)\s*$/u;
const BOLD_QUESTION = /^\*\*(.+?)\*\*\s*$/u;
const JSX_FAQ = /<Faq>\s*([\s\S]*?)\s*<\/Faq>/u;
const JSX_ITEM = /<FaqItem\s+question=(?:"([^"]*)"|\{"((?:[^"\\]|\\.)*)"\})>\s*([\s\S]*?)\s*<\/FaqItem>/gu;
const APPLY = process.argv.includes("--write");

function splitFrontmatter(source) {
  if (!source.startsWith("---\n")) throw new Error("no frontmatter");
  const end = source.indexOf("\n---\n", 4);
  if (end < 0) throw new Error("unterminated frontmatter");
  return { frontmatter: source.slice(4, end + 1), body: source.slice(end + 5) };
}

function blockScalar(value, indent) {
  const pad = " ".repeat(indent);
  const lines = value.split("\n").map((line) => (line.length ? pad + line : ""));
  return `|-\n${lines.join("\n")}`;
}

function removeFaqFrontmatter(frontmatter) {
  const lines = frontmatter.split("\n");
  const start = lines.findIndex((line) => /^faq:\s*$/u.test(line));
  if (start < 0) return frontmatter;

  let end = start + 1;
  while (end < lines.length && (!lines[end].trim() || /^\s/u.test(lines[end]))) end += 1;

  const next = [...lines.slice(0, start), ...lines.slice(end)].join("\n");
  return next.endsWith("\n") ? next : `${next}\n`;
}

function normalizeBodyWithoutFaq(body, start, end) {
  const before = body.slice(0, start).replace(/\s+$/u, "");
  const after = body.slice(end).replace(/^\s+/u, "");
  if (!before) return after ? `${after.replace(/\s+$/u, "")}\n` : "";
  if (!after) return `${before}\n`;
  return `${before}\n\n${after.replace(/\s+$/u, "")}\n`;
}

function decodeQuestion(quoted, expression) {
  if (expression !== undefined) return JSON.parse(`"${expression}"`);
  return quoted.replaceAll("&quot;", '"').replaceAll("&amp;", "&");
}

function extractJsxFaq(body, slug) {
  const block = JSX_FAQ.exec(body);
  if (!block) return null;
  if (JSX_FAQ.test(body.slice(block.index + block[0].length))) {
    return { unsupported: "more than one <Faq> block" };
  }

  const before = body.slice(0, block.index);
  const heading = /(^|\n)(##[^\n]+)\n(?:[ \t]*\n)*$/u.exec(before);
  if (!heading || !FAQ_HEADING.test(heading[2])) {
    return { unsupported: "<Faq> is not immediately preceded by an FAQ heading" };
  }

  const items = [];
  let cursor = 0;
  for (const match of block[1].matchAll(JSX_ITEM)) {
    if (block[1].slice(cursor, match.index).trim()) {
      return { unsupported: "unsupported content between <FaqItem> blocks" };
    }

    const content = match[3].trim();
    if (!content) return { unsupported: "an empty answer" };
    items.push({
      id: `${slug}-faq-${items.length + 1}`,
      title: decodeQuestion(match[1], match[2]),
      content,
    });
    cursor = match.index + match[0].length;
  }

  if (block[1].slice(cursor).trim()) return { unsupported: "unsupported content after the final <FaqItem>" };
  if (!items.length) return { unsupported: "no <FaqItem> entries in <Faq>" };

  const headingStart = heading.index + (heading[1] ? 1 : 0);
  return {
    heading: FAQ_HEADING.exec(heading[2])[1].trim(),
    items,
    body: normalizeBodyWithoutFaq(body, headingStart, block.index + block[0].length),
  };
}

function extractMarkdownFaq(body, slug) {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => FAQ_HEADING.test(line));
  if (start < 0) return null;

  let end = start + 1;
  while (end < lines.length && !/^##\s/u.test(lines[end])) end += 1;

  const heading = FAQ_HEADING.exec(lines[start])[1].trim();
  const block = lines.slice(start + 1, end);
  const marker = block.some((line) => QUESTION.test(line)) ? QUESTION : BOLD_QUESTION;
  const faqs = [];
  let current = null;

  for (const line of block) {
    const question = marker.exec(line);
    if (question) {
      if (current) faqs.push(current);
      current = { title: question[1], answer: [] };
      continue;
    }
    if (current) current.answer.push(line);
    else if (line.trim()) return { unsupported: `prose before the first question: ${line.trim().slice(0, 60)}` };
  }
  if (current) faqs.push(current);
  if (!faqs.length) return { unsupported: "no ### questions under the FAQ heading" };

  const items = faqs.map((faq, index) => ({
    id: `${slug}-faq-${index + 1}`,
    title: faq.title,
    content: faq.answer.join("\n").replace(/^\n+/, "").replace(/\n+$/, ""),
  }));

  if (items.some((item) => !item.content.trim())) return { unsupported: "an empty answer" };

  const remaining = [...lines.slice(0, start), ...lines.slice(end)];
  while (remaining.length && !remaining.at(-1).trim()) remaining.pop();

  return { heading, items, body: `${remaining.join("\n")}\n` };
}

function extractFaq(body, slug) {
  return extractJsxFaq(body, slug) ?? extractMarkdownFaq(body, slug);
}

function renderFaqYaml(heading, items) {
  const lines = ["faq:", `  title: ${JSON.stringify(heading)}`, "  faqs:"];
  for (const item of items) {
    lines.push(`  - id: ${item.id}`);
    lines.push(`    title: ${JSON.stringify(item.title)}`);
    lines.push(`    content: ${blockScalar(item.content, 8)}`);
  }
  return `${lines.join("\n")}\n`;
}

const summary = { migrated: 0, skipped: [], questions: 0 };

for (const collection of COLLECTIONS) {
  for (const locale of LOCALES) {
    const dir = join("content", collection, locale);
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".mdx"))) {
      const path = join(dir, file);
      const slug = file.replace(/\.mdx$/u, "");
      const source = readFileSync(path, "utf8");

      const { frontmatter, body } = splitFrontmatter(source);
      const extracted = extractFaq(body, slug);
      if (!extracted) continue;
      if (extracted.unsupported) {
        summary.skipped.push(`${path}: ${extracted.unsupported}`);
        continue;
      }

      const next = `---\n${removeFaqFrontmatter(frontmatter)}${renderFaqYaml(extracted.heading, extracted.items)}---\n${extracted.body}`;
      if (APPLY) writeFileSync(path, next);
      summary.migrated += 1;
      summary.questions += extracted.items.length;
    }
  }
}

console.log(`${APPLY ? "migrated" : "would migrate"} ${summary.migrated} files, ${summary.questions} questions`);
for (const skip of summary.skipped) console.log(`  SKIP ${skip}`);
