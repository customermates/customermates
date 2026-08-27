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

import { FeaturePoint, FeaturePoints } from "@/components/marketing/feature-points";
import { ProductDemo } from "@/components/marketing/product-demo";
import { Step, Steps } from "@/components/marketing/process-steps";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    ...markdownBaseComponents,
    APIPage,
    ComparisonTable,
    FeaturePoint,
    FeaturePoints,
    MarkdownImage,
    McpInstallSnippet,
    Mermaid,
    ProductDemo,
    Step,
    Steps,
    StatusAvailable,
    StatusPartial,
    StatusUnavailable,
    YouTube,
    ...components,
  };
}
