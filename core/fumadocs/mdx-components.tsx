import type { MDXComponents } from "mdx/types";

import defaultMdxComponents from "fumadocs-ui/mdx";

import { APIPage } from "./api-page";
import { DocsImage } from "./docs-image";
import { markdownBaseComponents } from "./markdown-base-components";
import { Mermaid } from "./mermaid";
import { StatusAvailable, StatusPartial, StatusUnavailable } from "./status-icon";

export const fumadocsMarkdownComponents = markdownBaseComponents;

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    ...markdownBaseComponents,
    APIPage,
    DocsImage,
    Mermaid,
    StatusAvailable,
    StatusPartial,
    StatusUnavailable,
    ...components,
  };
}
