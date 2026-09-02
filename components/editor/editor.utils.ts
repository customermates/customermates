import markdownit from "markdown-it";
// @ts-expect-error no type declarations available for markdown-it-task-lists
import taskListsPlugin from "markdown-it-task-lists";
import { MarkdownParser, MarkdownSerializer } from "prosemirror-markdown";
import { Node } from "@tiptap/pm/model";

import { editorSchema } from "@/components/editor/editor-extensions";

type MdToken = {
  type: string;
  tag: string;
  content: string;
  children: MdToken[] | null;
  attrGet(name: string): string | null;
  attrSet(name: string, value: string): void;
};

type MdState = { tokens: MdToken[]; Token: new (type: string, tag: string, nesting: 1 | 0 | -1) => MdToken };

type ListItemSpan = { open: number; close: number; carriesCheckbox: boolean };

type ListSpan = { open: number; close: number; ordered: boolean; items: ListItemSpan[] };

function collectListSpans(tokens: MdToken[]): ListSpan[] {
  const spans: ListSpan[] = [];
  const openLists: number[] = [];
  const openItems: Array<{ list: number; item: number }> = [];

  tokens.forEach((token, index) => {
    if (token.type === "bullet_list_open" || token.type === "ordered_list_open") {
      spans.push({ open: index, close: -1, ordered: token.type === "ordered_list_open", items: [] });
      openLists.push(spans.length - 1);
      return;
    }

    if (token.type === "bullet_list_close" || token.type === "ordered_list_close") {
      const list = openLists.pop();
      if (list !== undefined) spans[list].close = index;
      return;
    }

    if (token.type === "list_item_open") {
      const list = openLists.at(-1);
      if (list === undefined) return;

      spans[list].items.push({
        open: index,
        close: -1,
        carriesCheckbox: token.attrGet("class")?.includes("task-list-item") ?? false,
      });
      openItems.push({ list, item: spans[list].items.length - 1 });
      return;
    }

    if (token.type === "list_item_close") {
      const item = openItems.pop();
      if (item) spans[item.list].items[item.item].close = index;
    }
  });

  return spans;
}

function holdsOnlyParagraphs(tokens: MdToken[], item: ListItemSpan): boolean {
  for (let i = item.open + 1; i < item.close; i++) {
    const type = tokens[i].type;
    if (type !== "paragraph_open" && type !== "paragraph_close" && type !== "inline") return false;
  }

  return true;
}

function isRepresentableTaskList(tokens: MdToken[], span: ListSpan): boolean {
  if (span.ordered || span.close < 0 || span.items.length === 0) return false;

  return span.items.every((item) => item.carriesCheckbox && item.close >= 0 && holdsOnlyParagraphs(tokens, item));
}

function normalizeCheckboxItem(tokens: MdToken[], item: ListItemSpan, converted: boolean) {
  for (let i = item.open + 1; i < item.close; i++) {
    const children = tokens[i].children;
    if (tokens[i].type !== "inline" || !children?.length) continue;

    const first = children[0];
    if (first.type !== "html_inline" || !first.content.includes("task-list-item-checkbox")) continue;

    if (converted) tokens[item.open].attrSet("checked", first.content.includes("checked") ? "true" : "false");

    children.shift();

    if (children[0]?.type === "text" && children[0].content.startsWith(" "))
      children[0].content = children[0].content.slice(1);

    return;
  }
}

function rewriteTaskListTokens(state: MdState) {
  for (const span of collectListSpans(state.tokens)) {
    const converted = isRepresentableTaskList(state.tokens, span);

    if (converted) {
      state.tokens[span.open].type = "task_list_open";
      state.tokens[span.close].type = "task_list_close";
    }

    for (const item of span.items) {
      if (converted) {
        state.tokens[item.open].type = "task_item_open";
        state.tokens[item.close].type = "task_item_close";
      }

      if (item.carriesCheckbox) normalizeCheckboxItem(state.tokens, item, converted);
    }
  }
}

function wrapTableCellContentInParagraphs(state: MdState) {
  if (!state.tokens.some((token) => token.type === "table_open")) return;

  const result: MdToken[] = [];

  for (const token of state.tokens) {
    if (token.type === "th_open" || token.type === "td_open") {
      result.push(token, new state.Token("paragraph_open", "p", 1));
      continue;
    }

    if (token.type === "th_close" || token.type === "td_close") {
      result.push(new state.Token("paragraph_close", "p", -1), token);
      continue;
    }

    result.push(token);
  }

  state.tokens = result;
}

function createMarkdownParser() {
  const md = markdownit({ html: false }).use(taskListsPlugin);
  md.core.ruler.push("rewrite_task_list_tokens", rewriteTaskListTokens);
  md.core.ruler.push("wrap_table_cell_content", wrapTableCellContentInParagraphs);

  // @ts-expect-error markdown-it type mismatch between project @types/markdown-it and prosemirror-markdown bundled types
  return new MarkdownParser(editorSchema, md, {
    blockquote: { block: "blockquote" },
    paragraph: { block: "paragraph" },
    list_item: { block: "listItem" },
    bullet_list: { block: "bulletList" },
    ordered_list: { block: "orderedList", getAttrs: (tok) => ({ start: Number(tok.attrGet("start") || 1) }) },
    heading: { block: "heading", getAttrs: (tok) => ({ level: Number(tok.tag.slice(1)) }) },
    code_block: { block: "codeBlock" },
    fence: { block: "codeBlock", getAttrs: (tok) => ({ language: tok.info || null }) },
    hr: { node: "horizontalRule" },
    hardbreak: { node: "hardBreak" },
    task_list: { block: "taskList" },
    task_item: { block: "taskItem", getAttrs: (tok) => ({ checked: tok.attrGet("checked") === "true" }) },
    em: { mark: "italic" },
    strong: { mark: "bold" },
    s: { mark: "strike" },
    link: {
      mark: "link",
      getAttrs: (tok) => ({ href: tok.attrGet("href"), target: tok.attrGet("target") }),
    },
    code_inline: { mark: "code" },
    html_inline: { ignore: true },
    thead: { ignore: true },
    tbody: { ignore: true },
    image: {
      node: "image",
      getAttrs: (tok) => ({
        src: tok.attrGet("src"),
        alt: tok.children?.[0]?.content || null,
        title: tok.attrGet("title") || null,
      }),
    },
    table: { block: "table" },
    tr: { block: "tableRow" },
    th: { block: "tableHeader" },
    td: { block: "tableCell" },
  });
}

const markdownParser = createMarkdownParser();

export function parseMarkdownToJSON(markdown: string): object {
  const doc = markdownParser.parse(markdown);
  if (!doc) throw new Error("Failed to parse markdown");
  return doc.toJSON();
}

const markdownSerializer = new MarkdownSerializer(
  {
    blockquote: (state, node) => {
      state.wrapBlock("> ", null, node, () => state.renderContent(node));
    },
    codeBlock: (state, node) => {
      const language = (node.attrs.language as string) || "";
      state.write(`\`\`\`${language}\n`);
      state.text(node.textContent, false);
      state.ensureNewLine();
      state.write("```");
      state.closeBlock(node);
    },
    heading: (state, node) => {
      state.write(`${"#".repeat(node.attrs.level as number)} `);
      state.renderInline(node);
      state.closeBlock(node);
    },
    horizontalRule: (state, node) => {
      state.write("---");
      state.closeBlock(node);
    },
    bulletList: (state, node) => {
      state.renderList(node, "  ", () => "- ");
    },
    orderedList: (state, node) => {
      const start = (node.attrs.start as number) || 1;
      state.renderList(node, "   ", (i) => `${start + i}. `);
    },
    listItem: (state, node) => {
      state.renderContent(node);
    },
    taskList: (state, node) => {
      state.renderList(node, "  ", () => "- ");
    },
    taskItem: (state, node) => {
      const checked = node.attrs.checked as boolean;
      state.write(`[${checked ? "x" : " "}] `);
      state.renderContent(node);
    },
    paragraph: (state, node) => {
      state.renderInline(node);
      state.closeBlock(node);
    },
    hardBreak: (state) => {
      state.write("\\\n");
    },
    text: (state, node) => {
      state.text(node.text ?? "");
    },
    image: (state, node) => {
      const escapeWithBackslash = (value: string, specials: RegExp) =>
        value.replace(/\\/g, "\\\\").replace(specials, "\\$&");

      const alt = state.esc((node.attrs.alt as string) || "");
      const rawSrc = (node.attrs.src as string) || "";
      const srcNeedsAngleBrackets = /\s/.test(rawSrc);
      const src = srcNeedsAngleBrackets
        ? `<${escapeWithBackslash(rawSrc, /[<>]/g)}>`
        : escapeWithBackslash(rawSrc, /[()]/g);
      const title = node.attrs.title ? ` "${escapeWithBackslash(node.attrs.title as string, /"/g)}"` : "";
      state.write(`![${alt}](${src}${title})`);
    },
    table: (state, node) => {
      const serializeCellToSingleLine = (cell: Node) =>
        markdownSerializer
          .serialize(cell)
          .replace(/\\\n/g, " ")
          .replace(/\n+/g, " ")
          .replace(/\|/g, "\\|")
          .replace(/\s+/g, " ")
          .trim();

      const rows: string[][] = [];
      let columnCount = 0;

      node.forEach((row) => {
        const cells: string[] = [];
        row.forEach((cell) => {
          const spannedColumns = Math.max(1, (cell.attrs.colspan as number) || 1);
          const text = serializeCellToSingleLine(cell);
          for (let column = 0; column < spannedColumns; column++) cells.push(column === 0 ? text : "");
        });
        columnCount = Math.max(columnCount, cells.length);
        rows.push(cells);
      });
      if (rows.length === 0) return;

      const toLine = (row: string[]) =>
        `| ${Array.from({ length: columnCount }, (_, i) => row[i] ?? "").join(" | ")} |`;
      const separatorLine = `| ${Array.from({ length: columnCount }, () => "---").join(" | ")} |`;
      const emptyHeaderLine = toLine(Array.from({ length: columnCount }, () => ""));

      const firstRowIsHeader = node.firstChild?.firstChild?.type.name === "tableHeader";
      const lines = firstRowIsHeader
        ? [toLine(rows[0]), separatorLine, ...rows.slice(1).map(toLine)]
        : [emptyHeaderLine, separatorLine, ...rows.map(toLine)];

      lines.forEach((line, index) => {
        if (index > 0) state.ensureNewLine();
        state.write(line);
      });
      state.closeBlock(node);
    },
  },
  {
    bold: { open: "**", close: "**", mixable: true, expelEnclosingWhitespace: true },
    italic: { open: "*", close: "*", mixable: true, expelEnclosingWhitespace: true },
    strike: { open: "~~", close: "~~", mixable: true, expelEnclosingWhitespace: true },
    underline: { open: "", close: "", mixable: true },
    code: { open: "`", close: "`", escape: false },
    link: {
      open: "[",
      close: (_state, mark) => `](${mark.attrs.href as string})`,
    },
  },
);

export function serializeJSONToMarkdown(json: object): string {
  const doc = Node.fromJSON(editorSchema, json);
  return markdownSerializer.serialize(doc);
}

const MARKDOWN_ONLY_BLOCK_TYPES = new Set([
  "blockquote",
  "bulletList",
  "codeBlock",
  "heading",
  "horizontalRule",
  "image",
  "orderedList",
  "table",
  "taskList",
]);

export function hasMarkdownBlockStructure(json: object): boolean {
  let found = false;

  const walk = (node: { type?: string; content?: unknown[] }) => {
    if (found || !node) return;
    if (node.type && MARKDOWN_ONLY_BLOCK_TYPES.has(node.type)) {
      found = true;
      return;
    }

    for (const child of node.content ?? []) walk(child as { type?: string; content?: unknown[] });
  };

  walk(json as { type?: string; content?: unknown[] });

  return found;
}
