"use client";

import type { ComponentProps } from "react";
import { defaultRehypePlugins, type Components } from "streamdown";

import { AppLink } from "@/components/shared/app-link";
import { dataViewNavigationHref } from "@/core/data-view/data-view-links";
import { useRouter } from "@/i18n/navigation";

type MarkdownNode = {
  tagName?: string;
  properties?: Record<string, unknown>;
  data?: Record<string, unknown>;
  children?: MarkdownNode[];
};

function rehypeSavedViewLinks() {
  return function transform(node: MarkdownNode) {
    const href = node.tagName === "a" ? dataViewNavigationHref(node.properties?.href) : null;
    if (href) {
      node.tagName = "span";
      node.properties = {};
      node.data = { ...node.data, savedViewHref: href };
    }
    node.children?.forEach(transform);
  };
}

function SavedViewLink({ href, children, className }: ComponentProps<"a"> & { href: string }) {
  const router = useRouter();
  return (
    <AppLink
      inheritSize
      appearance="inline"
      className={className}
      href={href}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        router.push(href);
      }}
    >
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
