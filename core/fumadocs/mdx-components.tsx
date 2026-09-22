import type { MDXComponents } from "mdx/types";

import defaultMdxComponents from "fumadocs-ui/mdx";

import {
  AcquisitionCallout,
  ArticleSummary,
  ProofItem,
  ProofRail,
  SummaryItem,
} from "@/components/marketing/article-blocks";
import { Faq, FaqItem } from "@/components/marketing/faq";
import { ProductDemo } from "@/components/marketing/product-demo";
import { Step, Steps } from "@/components/marketing/process-steps";
import { markdownBaseComponents } from "./markdown-base-components";
import { McpInstallSnippet } from "./mcp-install-snippet";
import { StatusAvailable, StatusPartial, StatusUnavailable } from "./status-icon";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    ...markdownBaseComponents,
    AcquisitionCallout,
    ArticleSummary,
    Faq,
    FaqItem,
    ProductDemo,
    ProofItem,
    ProofRail,
    Step,
    Steps,
    SummaryItem,
    StatusAvailable,
    StatusPartial,
    StatusUnavailable,
    ...components,
  };
}

export function getDocsMDXComponents(components?: MDXComponents): MDXComponents {
  return getMDXComponents({ McpInstallSnippet, ...components });
}
