import type { MDXComponents } from "mdx/types";
import type { ComponentProps, ReactNode } from "react";

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
import { APP_LINK_SCHEME, publicAppLinkHref } from "@/features/docs/app-links";
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

function DocsLink({ href, ...props }: ComponentProps<"a">) {
  const Link = markdownBaseComponents.a as (props: ComponentProps<"a">) => ReactNode;
  return <Link href={href?.startsWith(APP_LINK_SCHEME) ? publicAppLinkHref(href) : href} {...props} />;
}

export function getDocsMDXComponents(components?: MDXComponents): MDXComponents {
  return getMDXComponents({ McpInstallSnippet, a: DocsLink, ...components });
}
