"use client";

import type { AiClientLogoProvider } from "@/components/ai-connection/ai-client-logo";
import type { LucideIcon } from "lucide-react";
import type { VisualProviderFixtureId } from "@/components/marketing/visuals/native-fixtures";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

import { ChevronDown, Slack } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { AiClientLogo } from "@/components/ai-connection/ai-client-logo";
import { AppLink } from "@/components/shared/app-link";
import { ProviderMark } from "@/components/marketing/visuals/native-visual-primitives";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/core/utils/cn";

export type PublicNavLink = {
  activeMatch?: boolean;
  href: string;
  mark?: PublicNavMark;
  title: string;
};

type PublicNavAgentProvider = Extract<AiClientLogoProvider, "chatgpt" | "claude" | "codex" | "cursor" | "gemini">;

export type PublicNavMark =
  | { kind: "agent"; provider: PublicNavAgentProvider }
  | { kind: "automation"; provider: "n8n" }
  | { kind: "channel"; provider: VisualProviderFixtureId }
  | { kind: "provider"; provider: "slack" };

export type PublicNavGroup = {
  activeHref: string;
  columns: 2 | 3;
  icon: LucideIcon;
  id: string;
  links: PublicNavLink[];
  title: string;
};

type Props = {
  ariaLabel: string;
  docsLabel: string;
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

export function PublicNavLinkMark({ mark }: { mark: PublicNavMark }) {
  let icon: ReactNode = null;

  if (mark.kind === "channel") icon = <ProviderMark decorative provider={mark.provider} size={18} />;

  if (mark.kind === "agent") icon = <AiClientLogo className="size-[18px]" provider={mark.provider} />;

  if (mark.kind === "automation") {
    icon = (
      // eslint-disable-next-line @next/next/no-img-element -- the allowlisted n8n mark is a bundled local SVG.
      <img aria-hidden alt="" className="h-4 w-[22px] shrink-0 object-contain" src="/icons/integrations/n8n.svg" />
    );
  }

  if (mark.kind === "provider") icon = <Slack aria-hidden className="size-[18px] text-[#4a154b] dark:text-[#e01e5a]" />;

  return (
    <span
      className="grid h-[18px] w-[22px] shrink-0 place-items-center"
      data-public-nav-mark={`${mark.kind}:${mark.provider}`}
    >
      {icon}
    </span>
  );
}

export function PublicNavbarMenu({ ariaLabel, docsLabel, groups, onNavigate, pathname, pricingLabel }: Props) {
  const [openGroup, setOpenGroup] = useState("");
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
  const visibleLinkCount = visibleGroup?.links.length ?? Math.max(1, ...groups.map((group) => group.links.length));

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
                      "group flex h-8 items-center gap-1 rounded-md px-2.5 text-[13px] font-medium outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none",
                      active || expanded ? "bg-accent text-foreground" : "text-subdued",
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
                  "flex h-8 items-center rounded-md px-2.5 text-[13px] font-medium transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent motion-reduce:transition-none",
                  isCurrentPage(pathname, "/pricing") ? "bg-accent text-foreground" : "text-subdued",
                )}
                href="/pricing"
                onNavigate={navigate}
              >
                {pricingLabel}
              </AppLink>
            </li>

            <li>
              <AppLink
                appearance="unstyled"
                aria-current={isCurrentPage(pathname, "/docs") ? "page" : undefined}
                className={cn(
                  "flex h-8 items-center rounded-md px-2.5 text-[13px] font-medium transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent motion-reduce:transition-none",
                  isCurrentPage(pathname, "/docs") ? "bg-accent text-foreground" : "text-subdued",
                )}
                href="/docs"
                onNavigate={navigate}
              >
                {docsLabel}
              </AppLink>
            </li>
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
              visibleColumnCount === 3
                ? "w-[min(45rem,calc(100vw-2rem))]"
                : visibleLinkCount <= 4
                  ? "w-[min(28rem,calc(100vw-2rem))]"
                  : "w-[min(34rem,calc(100vw-2rem))]",
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
                  className={cn(
                    "overflow-hidden rounded-lg border border-border bg-popover shadow-md",
                    !expanded && "hidden",
                  )}
                  data-public-nav-surface={group.id}
                  data-state={expanded ? "open" : "closed"}
                >
                  <ul className={cn("grid gap-px bg-border", group.columns === 3 ? "grid-cols-3" : "grid-cols-2")}>
                    {group.links.map((link) => {
                      const linkActive = isCurrentPage(pathname, link.href) && isPrimaryPublicNavLink(groups, link);

                      return (
                        <li key={`${link.href}-${link.title}`} className="min-w-0">
                          <AppLink
                            appearance="unstyled"
                            aria-current={linkActive ? "page" : undefined}
                            className={cn(
                              "flex h-full min-h-11 items-center gap-2.5 bg-popover px-3 py-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-accent focus-visible:bg-accent motion-reduce:transition-none",
                              linkActive && "bg-accent",
                            )}
                            href={link.href}
                            tabIndex={expanded ? undefined : -1}
                            onKeyDown={(event) => handlePanelLinkKeyDown(event, group.id)}
                            onNavigate={navigate}
                          >
                            {link.mark ? <PublicNavLinkMark mark={link.mark} /> : null}

                            <span className="min-w-0 truncate">{link.title}</span>
                          </AppLink>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </PopoverContent>
        ) : null}
      </Popover>
    </nav>
  );
}
