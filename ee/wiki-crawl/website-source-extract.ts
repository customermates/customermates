import type { FormatCallback } from "html-to-text";

import { compile } from "html-to-text";

export const WIKI_SOURCE_MAX_CHARACTERS = 40_000;
const WIKI_SOURCE_MAX_ANSWER_CHARACTERS = 2_000;
const WIKI_SOURCE_MAX_QA_PAIRS = 60;
const WIKI_SOURCE_MAX_LINKS = 400;

export type WikiSourceQa = { question: string; answer: string };
export type WikiSourceDocument = {
  title: string;
  text: string;
  qaPairs: WikiSourceQa[];
  links: Array<{ url: string; title: string }>;
  truncated: boolean;
};

const markdownHeading =
  (level: number): FormatCallback =>
  (element, walk, builder) => {
    builder.openBlock({ leadingLineBreaks: 2 });
    builder.addLiteral(`${"#".repeat(level)} `);
    walk(element.children ?? [], builder);
    builder.closeBlock({ trailingLineBreaks: 1 });
  };

const textOnly: FormatCallback = (element, walk, builder) => walk(element.children ?? [], builder);

function cleanText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/gu, " ").trim())
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

const plainText = compile({
  wordwrap: false,
  selectors: [
    { selector: "a", options: { ignoreHref: true } },
    { selector: "img", format: "skip" },
    ...["h1", "h2", "h3", "h4", "h5", "h6"].map((selector) => ({ selector, options: { uppercase: false } })),
  ],
});

function stripTags(value: string): string {
  return cleanText(plainText(value));
}

function contentRoot(html: string): string {
  if (/<main[\s>]/iu.test(html)) return "main";
  if (/<article[\s>]/iu.test(html)) return "article";
  if (/role\s*=\s*["']main["']/iu.test(html)) return "[role=main]";
  return "body";
}

function jsonLdQa(html: string): WikiSourceQa[] {
  const pairs: WikiSourceQa[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const types = ([] as unknown[]).concat(record["@type"] ?? []);
    if (types.includes("Question") && typeof record.name === "string") {
      const accepted = ([] as unknown[]).concat(record.acceptedAnswer ?? [])[0] as Record<string, unknown> | undefined;
      const answer = typeof accepted?.text === "string" ? stripTags(accepted.text) : "";
      if (answer) pairs.push({ question: stripTags(record.name), answer });
    }
    Object.values(record).forEach(visit);
  };
  for (const match of html.matchAll(
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu,
  )) {
    try {
      visit(JSON.parse(match[1]));
    } catch {
      continue;
    }
  }
  return pairs;
}

function headingQa(text: string): WikiSourceQa[] {
  const pairs: WikiSourceQa[] = [];
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    const heading = /^#{1,6} (.+\?)\s*$/u.exec(line);
    if (!heading) return;
    const answer: string[] = [];
    for (const next of lines.slice(index + 1)) {
      if (/^#{1,6} /u.test(next)) break;
      answer.push(next);
    }
    const body = cleanText(answer.join("\n"));
    if (body) pairs.push({ question: heading[1].trim(), answer: body });
  });
  return pairs;
}

function pageTitle(html: string, text: string): string {
  const title = stripTags(/<title[^>]*>([\s\S]*?)<\/title>/iu.exec(html)?.[1] ?? "");
  const headings = [...text.matchAll(/^# (.+)$/gmu)];
  const heading = headings.length === 1 ? headings[0][1] : undefined;
  return (heading ? stripTags(heading) : title || stripTags(headings[0]?.[1] ?? "")).slice(0, 160);
}

export function extractWikiSourceDocument(html: string, url: string, contentType: string): WikiSourceDocument {
  if (contentType === "text/plain" || contentType === "text/markdown") {
    const text = cleanText(html);
    return {
      title: /^# (.+)$/mu.exec(text)?.[1]?.slice(0, 160) ?? "",
      text: text.slice(0, WIKI_SOURCE_MAX_CHARACTERS),
      qaPairs: headingQa(text).slice(0, WIKI_SOURCE_MAX_QA_PAIRS),
      links: [],
      truncated: text.length > WIKI_SOURCE_MAX_CHARACTERS,
    };
  }
  const links: Array<{ url: string; title: string }> = [];
  const collectAnchor: FormatCallback = (element, walk, builder) => {
    let label = "";
    builder.pushWordTransform((word) => {
      label += `${word} `;
      return word;
    });
    walk(element.children ?? [], builder);
    builder.popWordTransform();
    const href: unknown = element.attribs?.href;
    if (typeof href !== "string" || links.length >= WIKI_SOURCE_MAX_LINKS) return;
    try {
      links.push({ url: new URL(href, url).toString(), title: cleanText(label).slice(0, 120) });
    } catch {
      return;
    }
  };
  compile({
    wordwrap: false,
    baseElements: { selectors: ["body"], returnDomByDefault: true },
    limits: { maxInputLength: 512_000, maxDepth: 64, maxChildNodes: 10_000 },
    formatters: { collectAnchor },
    selectors: [{ selector: "a", format: "collectAnchor" }],
  })(html);

  const text = cleanText(
    compile({
      wordwrap: false,
      baseElements: { selectors: [contentRoot(html)], returnDomByDefault: true },
      limits: { maxInputLength: 512_000, maxDepth: 64, maxChildNodes: 10_000 },
      formatters: {
        textOnly,
        h1: markdownHeading(1),
        h2: markdownHeading(2),
        h3: markdownHeading(3),
        h4: markdownHeading(4),
        summary: markdownHeading(3),
      },
      selectors: [
        { selector: "a", format: "textOnly" },
        { selector: "h1", format: "h1" },
        { selector: "h2", format: "h2" },
        { selector: "h3", format: "h3" },
        { selector: "h4", format: "h4" },
        { selector: "h5", format: "h4" },
        { selector: "h6", format: "h4" },
        { selector: "summary", format: "summary" },
        ...[
          "script",
          "style",
          "noscript",
          "template",
          "img",
          "svg",
          "form",
          "nav",
          "footer",
          "header",
          "button",
          "iframe",
        ].map((selector) => ({ selector, format: "skip" })),
      ],
    })(html),
  );
  const questions = new Set<string>();
  const qaPairs = [...jsonLdQa(html), ...headingQa(text)]
    .filter(({ question }) => {
      const key = question.toLocaleLowerCase();
      if (questions.has(key)) return false;
      questions.add(key);
      return true;
    })
    .map(({ question, answer }) => ({
      question: question.slice(0, 300),
      answer: answer.slice(0, WIKI_SOURCE_MAX_ANSWER_CHARACTERS),
    }))
    .slice(0, WIKI_SOURCE_MAX_QA_PAIRS);
  return {
    title: pageTitle(html, text),
    text: text.slice(0, WIKI_SOURCE_MAX_CHARACTERS),
    qaPairs,
    links,
    truncated: text.length > WIKI_SOURCE_MAX_CHARACTERS,
  };
}
