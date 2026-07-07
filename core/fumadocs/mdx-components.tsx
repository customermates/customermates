import type { MDXComponents } from "mdx/types";

import defaultMdxComponents from "fumadocs-ui/mdx";

import { APIPage } from "./api-page";
import { ComparisonTable } from "./comparison-table";
import { MarkdownImage } from "./markdown-image";
import { markdownBaseComponents } from "./markdown-base-components";
import { McpInstallSnippet } from "./mcp-install-snippet";
import { Mermaid } from "./mermaid";
import { StatusAvailable, StatusPartial, StatusUnavailable } from "./status-icon";
import { YouTube } from "./youtube-embed";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    ...markdownBaseComponents,
    APIPage,
    ComparisonTable,
    MarkdownImage,
    McpInstallSnippet,
    Mermaid,
    StatusAvailable,
    StatusPartial,
    StatusUnavailable,
    YouTube,
    ...components,
  };
}
