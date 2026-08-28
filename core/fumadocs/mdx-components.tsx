import type { MDXComponents } from "mdx/types";

import defaultMdxComponents from "fumadocs-ui/mdx";

import { APIPage } from "./api-page";
import { ComparisonTable } from "./comparison-table";
import {
  AcquisitionCallout,
  ArticleSummary,
  ProofItem,
  ProofRail,
  SummaryItem,
} from "@/components/marketing/article-blocks";
import { Faq, FaqItem } from "@/components/marketing/faq";
import { ProductDemo } from "@/components/marketing/product-demo";
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
    AcquisitionCallout,
    ArticleSummary,
    ComparisonTable,
    Faq,
    FaqItem,
    MarkdownImage,
    McpInstallSnippet,
    Mermaid,
    ProductDemo,
    ProofItem,
    ProofRail,
    RelatedPage,
    RelatedPages,
    Step,
    Steps,
    SummaryItem,
    StatusAvailable,
    StatusPartial,
    StatusUnavailable,
    YouTube,
    ...components,
  };
}
