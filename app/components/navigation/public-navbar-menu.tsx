"use client";

import type { LucideIcon } from "lucide-react";
import type { VisualProviderFixtureId } from "@/components/marketing/visuals/native-fixtures";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { AppLink } from "@/components/shared/app-link";
import { ProviderMark } from "@/components/marketing/visuals/native-visual-primitives";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/core/utils/cn";

export type PublicNavLink = {
  href: string;
  provider?: VisualProviderFixtureId;
  title: string;
};

export type PublicNavGroup = {
  activeHref: string;
  description: string;
  icon: LucideIcon;
  id: string;
  sections: {
    links: PublicNavLink[];
    title: string;
  }[];
  title: string;
};

type Props = {
  ariaLabel: string;
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
  return [group.activeHref, ...group.sections.flatMap((section) => section.links.map((link) => link.href))].reduce(
    (best, href) => {
      if (!isPathActive(pathname, href)) return best;

      const exactMatchBonus = pathname === href ? 10_000 : 0;
      return Math.max(best, exactMatchBonus + href.length);
    },
    -1,
  );
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

export function isPrimaryPublicNavLink(group: PublicNavGroup, link: PublicNavLink) {
  return group.sections.flatMap((section) => section.links).find((candidate) => candidate.href === link.href) === link;
}

export function PublicNavbarMenu({ ariaLabel, groups, onNavigate, pathname, pricingLabel }: Props) {
  const [openGroup, setOpenGroup] = useState("");
  const hydrated = useSyncExternalStore(subscribeToHydration, clientHydrationSnapshot, serverHydrationSnapshot);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const keyboardNavigationRef = useRef(false);
  const panelRefs = useRef(new Map<string, HTMLDivElement>());
  const pricingItemRef = useRef<HTMLLIElement>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const activeGroupId = resolveActivePublicNavGroup(pathname, groups);

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
                      "group flex h-8 items-center gap-1 rounded-md px-2.5 text-sm font-medium outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      active || expanded ? "text-foreground" : "text-subdued",
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
                  "flex h-8 items-center rounded-md px-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent",
                  !isCurrentPage(pathname, "/pricing") && "text-subdued",
                )}
                href="/pricing"
                onNavigate={navigate}
              >
                {pricingLabel}
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
            className="w-[min(64rem,calc(100vw-2rem))] rounded-xl border-0 bg-transparent p-0 shadow-none data-[state=closed]:pointer-events-none data-[state=closed]:invisible data-[state=closed]:animate-none data-[state=open]:animate-none"
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
                  className={cn(!expanded && "hidden")}
                  data-public-nav-surface={group.id}
                  data-state={expanded ? "open" : "closed"}
                >
                  <div className="overflow-hidden rounded-xl border border-border-strong bg-popover text-popover-foreground shadow-lg">
                    <div className="border-b border-border bg-sidebar/45 px-6 py-5">
                      <p className="text-sm font-semibold text-foreground">{group.title}</p>

                      <p className="mt-1 max-w-2xl text-sm leading-6 text-subdued">{group.description}</p>
                    </div>

                    <div
                      className={cn(
                        "grid content-start gap-x-8 gap-y-7 p-6",
                        group.sections.length >= 3
                          ? "grid-cols-3"
                          : group.sections.length === 2
                            ? "grid-cols-2"
                            : "grid-cols-1",
                      )}
                    >
                      {group.sections.map((section, sectionIndex) => (
                        <section key={section.title} aria-labelledby={`public-nav-${group.id}-${sectionIndex}`}>
                          <p
                            className="text-xs font-medium uppercase tracking-[0.14em] text-subdued"
                            id={`public-nav-${group.id}-${sectionIndex}`}
                          >
                            {section.title}
                          </p>

                          <ul
                            className={cn(
                              "mt-3 space-y-1",
                              group.sections.length === 1 && "grid max-w-2xl grid-cols-2 gap-x-8 space-y-0",
                            )}
                          >
                            {section.links.map((link) => {
                              const linkActive =
                                isCurrentPage(pathname, link.href) && isPrimaryPublicNavLink(group, link);

                              return (
                                <li key={`${link.href}-${link.title}`}>
                                  <AppLink
                                    appearance="unstyled"
                                    aria-current={linkActive ? "page" : undefined}
                                    className={cn(
                                      "-mx-2.5 flex min-h-9 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:bg-accent",
                                      linkActive && "bg-accent",
                                    )}
                                    href={link.href}
                                    tabIndex={expanded ? undefined : -1}
                                    onKeyDown={(event) => handlePanelLinkKeyDown(event, group.id)}
                                    onNavigate={navigate}
                                  >
                                    {link.provider ? (
                                      <ProviderMark decorative provider={link.provider} size={18} />
                                    ) : null}

                                    {link.title}
                                  </AppLink>
                                </li>
                              );
                            })}
                          </ul>
                        </section>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </PopoverContent>
        ) : null}
      </Popover>
    </nav>
  );
}
