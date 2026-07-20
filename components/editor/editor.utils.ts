import markdownit from "markdown-it";
// @ts-expect-error no type declarations available for markdown-it-task-lists
import taskListsPlugin from "markdown-it-task-lists";
import { MarkdownParser, MarkdownSerializer, MarkdownSerializerState } from "prosemirror-markdown";
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

function rewriteTaskListTokens(state: MdState) {
  const taskListStack: boolean[] = [];

  for (const token of state.tokens) {
    if (token.type === "bullet_list_open") {
      const isTaskList = token.attrGet("class")?.includes("contains-task-list") ?? false;
      taskListStack.push(isTaskList);
      if (isTaskList) token.type = "task_list_open";
    } else if (token.type === "bullet_list_close") {
      if (taskListStack.pop()) token.type = "task_list_close";
    } else if (token.type === "list_item_open" && token.attrGet("class")?.includes("task-list-item"))
      token.type = "task_item_open";
    else if (token.type === "list_item_close" && taskListStack.at(-1)) token.type = "task_item_close";
  }

  for (let i = 0; i < state.tokens.length; i++) {
    if (state.tokens[i].type !== "task_item_open") continue;

    for (let j = i + 1; j < state.tokens.length; j++) {
      if (state.tokens[j].type === "task_item_close") break;

      const children = state.tokens[j].children;
      if (state.tokens[j].type !== "inline" || !children?.length) continue;

      const first = children[0];
      if (first.type !== "html_inline" || !first.content.includes("task-list-item-checkbox")) continue;

      const checked = first.content.includes("checked");
      state.tokens[i].attrSet("checked", checked ? "true" : "false");
      children.shift();

      if (children[0]?.type === "text" && children[0].content.startsWith(" "))
        children[0].content = children[0].content.slice(1);

      break;
    }
  }
}

function normalizeTableTokens(state: MdState) {
  if (!state.tokens.some((token) => token.type === "table_open")) return;

  const result: MdToken[] = [];

  for (const token of state.tokens) {
    if (
      token.type === "thead_open" ||
      token.type === "thead_close" ||
      token.type === "tbody_open" ||
      token.type === "tbody_close"
    )
      continue;

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
  md.core.ruler.push("normalize_table_tokens", normalizeTableTokens);

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

const InlineSerializerState = MarkdownSerializerState as unknown as new (
  nodes: ConstructorParameters<typeof MarkdownSerializer>[0],
  marks: ConstructorParameters<typeof MarkdownSerializer>[1],
  options: Record<string, unknown>,
) => { renderInline(node: Node): void; text(text: string, escape?: boolean): void; out: string };

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
      state.renderList(node, "  ", () => "");
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
      const serializeCellToSingleLine = (cell: Node) => {
        const sub = new InlineSerializerState(markdownSerializer.nodes, markdownSerializer.marks, {});
        const blockTexts: string[] = [];

        cell.forEach((block) => {
          const lengthBeforeBlock = sub.out.length;
          if (block.isTextblock) sub.renderInline(block);
          else sub.text(block.textContent);
          blockTexts.push(sub.out.slice(lengthBeforeBlock));
        });

        return blockTexts
          .join(" ")
          .replace(/\\\n/g, " ")
          .replace(/\n+/g, " ")
          .replace(/\|/g, "\\|")
          .replace(/\s+/g, " ")
          .trim();
      };

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
