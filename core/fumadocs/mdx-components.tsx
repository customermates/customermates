import type { MDXComponents } from "mdx/types";

import defaultMdxComponents from "fumadocs-ui/mdx";

import { APIPage } from "./api-page";
import { ComparisonTable } from "./comparison-table";
import { Faq, FaqItem } from "@/components/marketing/faq";
import { RelatedPage, RelatedPages } from "@/components/marketing/related-pages";
import { Step, Steps } from "@/components/marketing/process-steps";
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
    Faq,
    FaqItem,
    MarkdownImage,
    McpInstallSnippet,
    Mermaid,
    RelatedPage,
    RelatedPages,
    Step,
    Steps,
    StatusAvailable,
    StatusPartial,
    StatusUnavailable,
    YouTube,
    ...components,
  };
}
