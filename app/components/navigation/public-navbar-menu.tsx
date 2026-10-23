"use client";

import type { AiClientLogoProvider } from "@/components/ai-connection/ai-client-logo";
import type { LucideIcon } from "lucide-react";
import type { VisualProviderFixtureId } from "@/components/marketing/visuals/native-fixtures";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

import { ArrowUpRight, ChevronDown, Slack } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";
import { AppLink } from "@/components/shared/app-link";
import { ProviderMark } from "@/components/marketing/visuals/native-visual-primitives";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/core/utils/cn";

export type PublicNavPreviewImage = {
  height: number;
  src: string;
  width: number;
};

export type PublicNavPreview = {
  dark: PublicNavPreviewImage;
  description: string;
  exampleHref: string;
  exampleLabel: string;
  light: PublicNavPreviewImage;
  tagline: string;
};

type PublicNavLinkBase = {
  activeMatch?: boolean;
  footer?: boolean;
  href: string;
  preview?: PublicNavPreview;
  section?: string;
  title: string;
};

export type PublicNavLink = PublicNavLinkBase &
  ({ icon: LucideIcon; mark?: never } | { icon?: never; mark: PublicNavMark });

type PublicNavAgentProvider = Extract<
  AiClientLogoProvider,
  "chatgpt" | "claude" | "codex" | "cursor" | "gemini" | "grok"
>;

export type PublicNavMark =
  | { kind: "agent"; provider: PublicNavAgentProvider }
  | { kind: "automation"; provider: "n8n" }
  | { kind: "channel"; muted?: boolean; provider: VisualProviderFixtureId }
  | { kind: "provider"; provider: "slack" };

export type PublicNavSection = {
  id: string;
  title: string;
};

export type PublicNavGroup = {
  activeHref: string;
  columns: 2 | 3;
  icon: LucideIcon;
  id: string;
  links: PublicNavLink[];
  sections?: PublicNavSection[];
  title: string;
};

type Props = {
  ariaLabel: string;
  docsLabel?: string;
  groups: PublicNavGroup[];
  onNavigate: () => void;
  pathname: string;
  pricingLabel: string;
};

function isPathActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isCurrentPage(pathname: string, href: string) {
  return pathname === href;
}

function groupMatchScore(pathname: string, group: PublicNavGroup) {
  return [
    group.activeHref,
    ...group.links.filter((link) => link.activeMatch !== false).map((link) => link.href),
  ].reduce((best, href) => {
    if (!isPathActive(pathname, href)) return best;

    const exactMatchBonus = pathname === href ? 10_000 : 0;
    return Math.max(best, exactMatchBonus + href.length);
  }, -1);
}

const subscribeToHydration = () => () => undefined;
const clientHydrationSnapshot = () => true;
const serverHydrationSnapshot = () => false;

export function resolveActivePublicNavGroup(pathname: string, groups: PublicNavGroup[]) {
  let activeGroupId: string | null = null;
  let activeGroupScore = -1;

  for (const group of groups) {
    const score = groupMatchScore(pathname, group);

    if (score >= 0 && score >= activeGroupScore) {
      activeGroupId = group.id;
      activeGroupScore = score;
    }
  }

  return activeGroupId;
}

export function isPrimaryPublicNavLink(groups: PublicNavGroup[], link: PublicNavLink) {
  for (const group of groups) {
    const primaryLink = group.links.find((candidate) => candidate.href === link.href);
    if (primaryLink) return primaryLink === link;
  }

  return false;
}

function PublicNavLinkMark({ mark }: { mark: PublicNavMark }) {
  const hydrated = useSyncExternalStore(subscribeToHydration, clientHydrationSnapshot, serverHydrationSnapshot);
  let icon: ReactNode = null;

  if (mark.kind === "channel") icon = <ProviderMark decorative provider={mark.provider} size={15} />;

  if (mark.kind === "agent") icon = <AiClientLogo className="size-[15px]" provider={mark.provider} />;

  if (mark.kind === "automation") {
    icon = (
      // eslint-disable-next-line @next/next/no-img-element -- the allowlisted n8n mark is a bundled local SVG.
      <img aria-hidden alt="n8n" className="h-3.5 w-5 shrink-0 object-contain" src="/icons/integrations/n8n.svg" />
    );
  }

  if (mark.kind === "provider") icon = <Slack aria-hidden className="size-[15px] text-[#4a154b] dark:text-[#e01e5a]" />;

  return (
    <span
      className={cn(
        "grid size-5 shrink-0 place-items-center",
        mark.kind === "channel" &&
          mark.muted &&
          "opacity-60 grayscale transition-opacity duration-150 group-hover/link:opacity-90 group-focus-visible/link:opacity-90 motion-reduce:transition-none",
      )}
      data-public-nav-mark={`${mark.kind}:${mark.provider}`}
    >
      {hydrated ? icon : null}
    </span>
  );
}

const PREVIEW_THEMES = [
  { className: "dark:hidden", theme: "light" },
  { className: "not-dark:hidden", theme: "dark" },
] as const;

function PublicNavLinkIcon({ icon: LinkIcon }: { icon: LucideIcon }) {
  return (
    <span
      aria-hidden
      className="grid size-5 shrink-0 place-items-center text-muted-foreground transition-colors duration-150 group-hover/link:text-subdued group-focus-visible/link:text-subdued group-aria-[current=page]/link:text-subdued motion-reduce:transition-none"
      data-public-nav-icon="true"
    >
      <LinkIcon className="size-[15px]" strokeWidth={1.75} />
    </span>
  );
}

export function PublicNavbarMenu({ ariaLabel, docsLabel, groups, onNavigate, pathname, pricingLabel }: Props) {
  const [openGroup, setOpenGroup] = useState("");
  const [previewHref, setPreviewHref] = useState("");
  const hydrated = useSyncExternalStore(subscribeToHydration, clientHydrationSnapshot, serverHydrationSnapshot);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const keyboardNavigationRef = useRef(false);
  const panelRefs = useRef(new Map<string, HTMLDivElement>());
  const pricingItemRef = useRef<HTMLLIElement>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const activeGroupId = resolveActivePublicNavGroup(pathname, groups);
  const visibleGroup = groups.find((group) => group.id === openGroup);
  const visibleColumnCount = visibleGroup?.columns ?? Math.max(2, ...groups.map((group) => group.columns));

  function cancelScheduledClose() {
    if (!closeTimerRef.current) return;
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }

  function open(groupId: string) {
    cancelScheduledClose();
    if (groupId !== openGroup && contentRef.current) contentRef.current.scrollTop = 0;
    setOpenGroup(groupId);
  }

  function groupContainsFocus(groupId: string) {
    const focusedElement = document.activeElement;
    if (panelRefs.current.get(groupId)?.contains(focusedElement)) return true;
    return keyboardNavigationRef.current && focusedElement === triggerRefs.current.get(groupId);
  }

  function openFromPointer(groupId: string) {
    if (groupId !== openGroup && groupContainsFocus(openGroup)) return;
    open(groupId);
  }

  function close({ restoreFocusTo = "" }: { restoreFocusTo?: string } = {}) {
    cancelScheduledClose();
    setOpenGroup("");
    if (restoreFocusTo) triggerRefs.current.get(restoreFocusTo)?.focus();
  }

  function scheduleClose() {
    cancelScheduledClose();
    const scheduledGroup = openGroup;
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      if (groupContainsFocus(scheduledGroup)) return;

      setOpenGroup((currentGroup) => (currentGroup === scheduledGroup ? "" : currentGroup));
    }, 180);
  }

  function focusAfterGroup(groupId: string) {
    const groupIndex = groups.findIndex((group) => group.id === groupId);
    const nextGroup = groups[groupIndex + 1];
    close();

    if (nextGroup) triggerRefs.current.get(nextGroup.id)?.focus();
    else pricingItemRef.current?.querySelector<HTMLAnchorElement>("a[href]")?.focus();
  }

  function handlePanelLinkKeyDown(event: ReactKeyboardEvent<HTMLAnchorElement>, groupId: string) {
    if (event.key !== "Tab" || openGroup !== groupId) return;
    keyboardNavigationRef.current = true;

    const links = [...(panelRefs.current.get(groupId)?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? [])];
    const currentIndex = links.findIndex((link) => link === document.activeElement);
    if (currentIndex < 0) return;

    event.preventDefault();
    event.stopPropagation();
    if (event.shiftKey) {
      if (currentIndex === 0) close({ restoreFocusTo: groupId });
      else links[currentIndex - 1]?.focus();
      return;
    }

    if (currentIndex === links.length - 1) focusAfterGroup(groupId);
    else links[currentIndex + 1]?.focus();
  }

  function navigate() {
    close();
    onNavigate();
  }

  function renderPanelLink(group: PublicNavGroup, link: PublicNavLink, expanded: boolean) {
    const linkActive = isCurrentPage(pathname, link.href) && isPrimaryPublicNavLink(groups, link);
    const summary = link.footer ? undefined : link.preview?.tagline;

    return (
      <AppLink
        appearance="unstyled"
        aria-current={linkActive ? "page" : undefined}
        className={cn(
          "group/link flex gap-2 rounded-md px-2 text-[13px] leading-none outline-none transition-colors duration-150 hover:bg-foreground/[0.05] hover:text-foreground focus-visible:bg-foreground/[0.05] focus-visible:text-foreground motion-reduce:transition-none",
          summary ? "h-11 items-start py-1.5" : "h-[30px] items-center",
          linkActive ? "bg-foreground/[0.05] text-foreground" : "text-subdued",
        )}
        data-public-nav-link={link.href}
        href={link.href}
        tabIndex={expanded ? undefined : -1}
        onFocus={link.preview ? () => setPreviewHref(link.href) : undefined}
        onKeyDown={(event) => handlePanelLinkKeyDown(event, group.id)}
        onNavigate={navigate}
        onPointerEnter={link.preview ? () => setPreviewHref(link.href) : undefined}
      >
        {link.mark ? <PublicNavLinkMark mark={link.mark} /> : <PublicNavLinkIcon icon={link.icon} />}

        {summary ? (
          <span className="grid min-w-0 gap-0.5">
            <span className="truncate leading-[18px]">{link.title}</span>

            <span data-public-nav-summary className="truncate text-xs leading-4 text-muted-foreground">
              {summary}
            </span>
          </span>
        ) : (
          <span className="min-w-0 truncate">{link.title}</span>
        )}
      </AppLink>
    );
  }

  function renderLinkList(group: PublicNavGroup, links: PublicNavLink[], expanded: boolean, className?: string) {
    return (
      <ul className={cn("grid gap-px", className)}>
        {links.map((link) => (
          <li key={`${link.href}-${link.title}`} className="min-w-0">
            {renderPanelLink(group, link, expanded)}
          </li>
        ))}
      </ul>
    );
  }

  function renderGridPanel(group: PublicNavGroup, expanded: boolean) {
    return renderLinkList(
      group,
      group.links,
      expanded,
      group.columns === 3 ? "grid-cols-3 gap-x-1" : "grid-cols-2 gap-x-1",
    );
  }

  function renderPreviewCard(group: PublicNavGroup, link: PublicNavLink | undefined, expanded: boolean) {
    const preview = link?.preview;
    if (!link || !preview) return null;

    return (
      <div
        className="hidden w-[22rem] shrink-0 flex-col gap-2 rounded-xl bg-foreground/[0.025] p-1.5 pb-2.5 xl:flex"
        data-public-nav-preview={link.href}
      >
        <div aria-hidden className="relative aspect-[16/10] overflow-hidden rounded-lg border border-border bg-sidebar">
          {PREVIEW_THEMES.map(({ className, theme }) => (
            // eslint-disable-next-line @next/next/no-img-element -- one decorative capture, loaded only for the selected entry
            <img
              key={`${link.href}-${theme}`}
              alt=""
              className={cn("absolute inset-0 size-full object-cover object-left-top", className)}
              data-public-nav-preview-theme={theme}
              decoding="async"
              height={preview[theme].height}
              src={preview[theme].src}
              width={preview[theme].width}
            />
          ))}
        </div>

        <div className="grid gap-0.5 px-1.5">
          <p className="truncate text-[13px] leading-5 font-medium text-foreground">{link.title}</p>

          <p className="truncate text-[13px] leading-5 text-muted-foreground" title={preview.description}>
            {preview.description}
          </p>
        </div>

        <AppLink
          external
          appearance="unstyled"
          className="mx-1.5 inline-flex w-fit items-center gap-1 rounded-sm text-[13px] leading-5 font-medium text-subdued outline-none transition-colors duration-150 hover:text-foreground focus-visible:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none"
          data-public-nav-example={preview.exampleHref}
          href={preview.exampleHref}
          prefetch={false}
          tabIndex={expanded ? undefined : -1}
          onClick={() => close()}
          onKeyDown={(event) => handlePanelLinkKeyDown(event, group.id)}
        >
          {preview.exampleLabel}

          <ArrowUpRight aria-hidden className="size-3.5" strokeWidth={1.75} />
        </AppLink>
      </div>
    );
  }

  function renderSectionedPanel(group: PublicNavGroup, sections: PublicNavSection[], expanded: boolean) {
    const previewLinks = group.links.filter((link) => link.preview);
    const currentPreview = previewLinks.find((link) => isCurrentPage(pathname, link.href));
    const selectedPreview = previewLinks.find((link) => link.href === previewHref) ?? currentPreview ?? previewLinks[0];
    const footerLinks = group.links.filter((link) => link.footer);

    return (
      <div className="flex gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="grid grid-cols-2 gap-x-1">
            {sections.map((section) => (
              <div key={section.id} className="min-w-0" data-public-nav-section={section.id}>
                <p className="px-2 py-1.5 text-xs leading-4 text-muted-foreground">{section.title}</p>

                {renderLinkList(
                  group,
                  group.links.filter((link) => link.section === section.id && !link.footer),
                  expanded,
                )}
              </div>
            ))}
          </div>

          {footerLinks.length > 0 ? (
            <div data-public-nav-footer className="mt-2 grid grid-cols-2 gap-x-1 border-t border-border pt-2">
              {sections.map((section) => (
                <div key={section.id} className="min-w-0">
                  {renderLinkList(
                    group,
                    footerLinks.filter((link) => link.section === section.id),
                    expanded,
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {expanded && hydrated ? renderPreviewCard(group, selectedPreview, expanded) : null}
      </div>
    );
  }

  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  return (
    <nav aria-label={ariaLabel} className="hidden justify-self-center xl:flex">
      <Popover
        open={Boolean(openGroup)}
        onOpenChange={(nextOpen) => {
          if (nextOpen) return;
          close();
        }}
      >
        <PopoverAnchor asChild>
          <ul className="flex list-none items-center gap-0.5">
            {groups.map((group) => {
              const active = activeGroupId === group.id;
              const expanded = openGroup === group.id;
              return (
                <li key={group.id} onMouseEnter={() => openFromPointer(group.id)} onMouseLeave={scheduleClose}>
                  <button
                    ref={(node) => {
                      if (node) triggerRefs.current.set(group.id, node);
                      else triggerRefs.current.delete(group.id);
                    }}
                    aria-controls="public-nav-popover"
                    aria-expanded={expanded}
                    className={cn(
                      "group flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-medium outline-none transition-[background-color,color,box-shadow] duration-200 hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none",
                      active || expanded ? "bg-foreground/[0.07] text-foreground" : "text-subdued",
                    )}
                    data-public-nav-active={active ? "true" : undefined}
                    data-public-nav-trigger={group.id}
                    data-state={expanded ? "open" : "closed"}
                    id={`public-nav-trigger-${group.id}`}
                    onClick={(event) => {
                      if (event.detail > 0) {
                        keyboardNavigationRef.current = false;
                        open(group.id);
                        return;
                      }

                      keyboardNavigationRef.current = true;
                      if (expanded) close({ restoreFocusTo: group.id });
                      else open(group.id);
                    }}
                    onKeyDown={(event) => {
                      if (["Escape", "Tab", "Enter", " "].includes(event.key)) keyboardNavigationRef.current = true;

                      if (event.key === "Escape" && openGroup) {
                        event.preventDefault();
                        close({ restoreFocusTo: openGroup });
                        return;
                      }

                      if (event.key === "Tab" && !event.shiftKey && expanded) {
                        const firstLink = panelRefs.current.get(group.id)?.querySelector<HTMLAnchorElement>("a[href]");
                        if (!firstLink) return;

                        event.preventDefault();
                        cancelScheduledClose();
                        firstLink.focus();
                        return;
                      }

                      if (event.key !== "Enter" && event.key !== " ") return;

                      event.preventDefault();
                      if (expanded) close({ restoreFocusTo: group.id });
                      else open(group.id);
                    }}
                    onPointerDown={() => {
                      keyboardNavigationRef.current = false;
                    }}
                  >
                    {group.title}

                    <ChevronDown
                      aria-hidden
                      className="size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none"
                    />
                  </button>
                </li>
              );
            })}

            <li ref={pricingItemRef}>
              <AppLink
                appearance="unstyled"
                aria-current={isCurrentPage(pathname, "/pricing") ? "page" : undefined}
                className={cn(
                  "flex h-8 items-center rounded-full px-3 text-[13px] font-medium transition-[background-color,color,box-shadow] duration-200 hover:bg-foreground/[0.06] hover:text-foreground focus-visible:bg-foreground/[0.06] motion-reduce:transition-none",
                  isCurrentPage(pathname, "/pricing") ? "bg-foreground/[0.07] text-foreground" : "text-subdued",
                )}
                href="/pricing"
                onNavigate={navigate}
              >
                {pricingLabel}
              </AppLink>
            </li>

            {docsLabel ? (
              <li>
                <AppLink
                  appearance="unstyled"
                  aria-current={isCurrentPage(pathname, "/docs") ? "page" : undefined}
                  className={cn(
                    "flex h-8 items-center rounded-full px-3 text-[13px] font-medium transition-[background-color,color,box-shadow] duration-200 hover:bg-foreground/[0.06] hover:text-foreground focus-visible:bg-foreground/[0.06] motion-reduce:transition-none",
                    isCurrentPage(pathname, "/docs") ? "bg-foreground/[0.07] text-foreground" : "text-subdued",
                  )}
                  href="/docs"
                  onNavigate={navigate}
                >
                  {docsLabel}
                </AppLink>
              </li>
            ) : null}
          </ul>
        </PopoverAnchor>

        {!hydrated || Boolean(openGroup) ? (
          <PopoverContent
            ref={contentRef}
            forceMount
            aria-hidden={!openGroup}
            aria-labelledby={openGroup ? `public-nav-trigger-${openGroup}` : undefined}
            className={cn(
              "max-h-[min(34rem,calc(100svh-5rem))] overflow-y-auto overscroll-contain rounded-lg border-0 bg-transparent p-0 shadow-none transition-[width] duration-200 ease-marketing data-[state=closed]:pointer-events-none data-[state=closed]:invisible data-[state=closed]:animate-none data-[state=open]:animate-none motion-reduce:transition-none",
              visibleGroup?.sections
                ? "w-[min(54rem,calc(100vw-2rem))]"
                : visibleColumnCount === 3
                  ? "w-[min(37.5rem,calc(100vw-2rem))]"
                  : "w-[min(26rem,calc(100vw-2rem))]",
            )}
            id="public-nav-popover"
            portalled={false}
            role="region"
            sideOffset={12}
            onCloseAutoFocus={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => {
              keyboardNavigationRef.current = true;
              event.preventDefault();
              close({ restoreFocusTo: openGroup });
            }}
            onMouseEnter={cancelScheduledClose}
            onMouseLeave={scheduleClose}
            onPointerDown={() => {
              keyboardNavigationRef.current = false;
            }}
          >
            {groups.map((group) => {
              const expanded = openGroup === group.id;
              return (
                <div
                  key={group.id}
                  ref={(node) => {
                    if (node) panelRefs.current.set(group.id, node);
                    else panelRefs.current.delete(group.id);
                  }}
                  aria-hidden={!expanded}
                  className={cn("floating-panel overflow-hidden rounded-2xl p-1.5", !expanded && "hidden")}
                  data-public-nav-surface={group.id}
                  data-state={expanded ? "open" : "closed"}
                >
                  {group.sections
                    ? renderSectionedPanel(group, group.sections, expanded)
                    : renderGridPanel(group, expanded)}
                </div>
              );
            })}
          </PopoverContent>
        ) : null}
      </Popover>
    </nav>
  );
}
