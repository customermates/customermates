type WikiDocumentNode = {
  attrs?: {
    level?: unknown;
  };
  content?: WikiDocumentNode[];
  text?: string;
  type?: string;
};

export type WikiDocumentHeading = {
  index: number;
  level: 1 | 2 | 3;
  text: string;
};

function nodeText(node: WikiDocumentNode): string {
  if (typeof node.text === "string") return node.text;

  return node.content?.map(nodeText).join("") ?? "";
}

export function wikiDocumentHeadings(document: object): WikiDocumentHeading[] {
  const headings: WikiDocumentHeading[] = [];
  let renderedHeadingIndex = 0;

  function visit(node: WikiDocumentNode) {
    const level = node.attrs?.level;
    if (node.type === "heading" && (level === 1 || level === 2 || level === 3)) {
      const text = nodeText(node).replace(/\s+/g, " ").trim();
      if (text) headings.push({ index: renderedHeadingIndex, level, text });
      renderedHeadingIndex += 1;
    }

    node.content?.forEach(visit);
  }

  visit(document);
  return headings;
}

export const WIKI_HEADING_ID_PREFIX = "wiki-heading";
