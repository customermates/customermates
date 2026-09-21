"use client";

import type { ComponentProps } from "react";
import { defaultRehypePlugins, type Components } from "streamdown";
import { useTranslations } from "next-intl";

import { AppLink } from "@/components/shared/app-link";
import { dataViewNavigationHref, dataViewNavigationRanges } from "@/core/data-view/data-view-links";
import { AI_MANAGEABLE_DATA_VIEW_SURFACE_KEYS } from "@/core/data-view/ai-manageable-surfaces";
import { DATA_VIEW_PATHS, ENTITY_TIMELINE_PARENT_PATHS } from "@/core/data-view/data-view-paths";
import { stripLocalePrefix } from "@/i18n/locale-registry";

type MarkdownNode = {
  type?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  data?: Record<string, unknown>;
  value?: string;
  children?: MarkdownNode[];
};

function origin() {
  return typeof window === "undefined" ? undefined : window.location.origin;
}

function isLocalViewLikeHref(value: unknown) {
  if (typeof value !== "string") return false;
  const base = origin() ?? "https://local.invalid";
  try {
    const target = new URL(value, base);
    if (target.origin !== new URL(base).origin || target.username || target.password || target.hash) return false;
    if (!target.searchParams.has("view")) return false;
    const pathname = stripLocalePrefix(target.pathname);
    const knownSurface = AI_MANAGEABLE_DATA_VIEW_SURFACE_KEYS.includes(
      target.searchParams.get("viewSurface") as (typeof AI_MANAGEABLE_DATA_VIEW_SURFACE_KEYS)[number],
    );
    const knownStandalonePath = AI_MANAGEABLE_DATA_VIEW_SURFACE_KEYS.some(
      (surfaceKey) => DATA_VIEW_PATHS[surfaceKey] === pathname,
    );
    const knownTimelinePath = ENTITY_TIMELINE_PARENT_PATHS.some(
      (parentPath) => pathname === parentPath || pathname.startsWith(`${parentPath}/`),
    );
    return knownSurface || knownStandalonePath || knownTimelinePath;
  } catch {
    return false;
  }
}

function rehypeInertMalformedViewLinks() {
  return function transform(node: MarkdownNode) {
    if (node.tagName === "a") {
      const rawHref = node.properties?.href;
      if (!dataViewNavigationHref(rawHref, { origin: origin() }) && isLocalViewLikeHref(rawHref)) {
        node.tagName = "span";
        node.properties = {};
        node.data = {};
      }
      return;
    }
    if (["code", "pre", "script", "style"].includes(node.tagName ?? "")) return;
    node.children?.forEach(transform);
  };
}

function bareSavedViewNodes(value: string): MarkdownNode[] | null {
  const nodes: MarkdownNode[] = [];
  let cursor = 0;
  let found = false;

  for (const range of dataViewNavigationRanges(value, { origin: origin() })) {
    if (range.start > cursor) nodes.push({ type: "text", value: value.slice(cursor, range.start) });
    nodes.push({
      type: "element",
      tagName: "span",
      properties: {},
      data: { savedViewHref: range.href, savedViewBare: true },
      children: [{ type: "text", value: value.slice(range.start, range.end) }],
    });
    cursor = range.end;
    found = true;
  }

  if (!found) return null;
  if (cursor < value.length) nodes.push({ type: "text", value: value.slice(cursor) });
  return nodes;
}

function rehypeSavedViewLinks() {
  return function transform(node: MarkdownNode) {
    const rawHref = node.tagName === "a" ? node.properties?.href : null;
    const href = dataViewNavigationHref(rawHref, { origin: origin() });
    if (href) {
      node.tagName = "span";
      node.properties = {};
      node.data = { ...node.data, savedViewHref: href };
      return;
    }
    if (["a", "code", "pre", "script", "style"].includes(node.tagName ?? "")) return;
    if (!node.children) return;
    node.children = node.children.flatMap((child) => {
      if (child.type === "text" && child.value) return bareSavedViewNodes(child.value) ?? [child];
      transform(child);
      return [child];
    });
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
  const t = useTranslations();
  const markdownNode = node as MarkdownNode | undefined;
  const href = dataViewNavigationHref(markdownNode?.data?.savedViewHref);
  if (href) {
    return (
      <SavedViewLink className={className} href={href}>
        {markdownNode?.data?.savedViewBare ? t("AgentChat.openSavedView") : children}
      </SavedViewLink>
    );
  }
  return (
    <span className={className} {...props}>
      {children}
    </span>
  );
}

export const agentMessageRehypePlugins = [
  defaultRehypePlugins.raw,
  defaultRehypePlugins.sanitize,
  rehypeInertMalformedViewLinks,
  rehypeSavedViewLinks,
  defaultRehypePlugins.harden,
];
export const agentMessageComponents: Components = { span: AgentMessageSpan };
