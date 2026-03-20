import markdownit from "markdown-it";
// @ts-expect-error no type declarations available for markdown-it-task-lists
import taskListsPlugin from "markdown-it-task-lists";
import { MarkdownParser, MarkdownSerializer } from "prosemirror-markdown";
import { Node } from "@tiptap/pm/model";

import { editorSchema } from "@/components/x-editor/x-editor-extensions";

type MdToken = {
  type: string;
  tag: string;
  content: string;
  children: MdToken[] | null;
  attrGet(name: string): string | null;
  attrSet(name: string, value: string): void;
};

type MdState = { tokens: MdToken[] };

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

function createMarkdownParser() {
  const md = markdownit({ html: false }).use(taskListsPlugin);
  md.core.ruler.push("rewrite_task_list_tokens", rewriteTaskListTokens);

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
