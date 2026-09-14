"use client";

import type { ComponentProps } from "react";
import { defaultRehypePlugins, type Components } from "streamdown";

import { AppLink } from "@/components/shared/app-link";
import { dataViewNavigationHref } from "@/core/data-view/data-view-links";

type MarkdownNode = {
  tagName?: string;
  properties?: Record<string, unknown>;
  data?: Record<string, unknown>;
  children?: MarkdownNode[];
};

function rehypeSavedViewLinks() {
  return function transform(node: MarkdownNode) {
    const href =
      node.tagName === "a"
        ? dataViewNavigationHref(node.properties?.href, {
            origin: typeof window === "undefined" ? undefined : window.location.origin,
          })
        : null;
    if (href) {
      node.tagName = "span";
      node.properties = {};
      node.data = { ...node.data, savedViewHref: href };
    }
    node.children?.forEach(transform);
  };
}

function SavedViewLink({ href, children, className }: ComponentProps<"a"> & { href: string }) {
  return (
    <AppLink inheritSize appearance="inline" className={className} href={href}>
      {children}
    </AppLink>
  );
}

function AgentMessageSpan({ node, children, className, ...props }: ComponentProps<"span"> & { node?: unknown }) {
  const href = dataViewNavigationHref((node as MarkdownNode | undefined)?.data?.savedViewHref);
  if (href) {
    return (
      <SavedViewLink className={className} href={href}>
        {children}
      </SavedViewLink>
    );
  }
  return (
    <span className={className} {...props}>
      {children}
    </span>
  );
}

export const agentMessageRehypePlugins = [...Object.values(defaultRehypePlugins), rehypeSavedViewLinks];
export const agentMessageComponents: Components = { span: AgentMessageSpan };
