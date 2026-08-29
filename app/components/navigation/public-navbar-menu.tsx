"use client";

import type { LucideIcon } from "lucide-react";
import type { VisualProviderFixtureId } from "@/components/marketing/visuals/native-fixtures";

import { ArrowRight, ChevronDown } from "lucide-react";
import { NavigationMenu } from "radix-ui";
import { useRef, useState } from "react";

import { AppLink } from "@/components/shared/app-link";
import { ProviderMark } from "@/components/marketing/visuals/native-visual-primitives";
import { cn } from "@/core/utils/cn";

export type PublicNavLink = {
  href: string;
  provider?: VisualProviderFixtureId;
  title: string;
};

export type PublicNavGroup = {
  description: string;
  featured: PublicNavLink;
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
  return [group.featured, ...group.sections.flatMap((section) => section.links)].reduce((best, link) => {
    if (!isPathActive(pathname, link.href)) return best;

    const exactMatchBonus = pathname === link.href ? 10_000 : 0;
    return Math.max(best, exactMatchBonus + link.href.length);
  }, -1);
}

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
  return (
    [group.featured, ...group.sections.flatMap((section) => section.links)].find(
      (candidate) => candidate.href === link.href,
    ) === link
  );
}

export function PublicNavbarMenu({ ariaLabel, groups, onNavigate, pathname, pricingLabel }: Props) {
  const [openGroup, setOpenGroup] = useState("");
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const activeGroupId = resolveActivePublicNavGroup(pathname, groups);

  function changeOpenGroup(value: string) {
    setOpenGroup(value);
  }

  function navigate() {
    setOpenGroup("");
    onNavigate();
  }

  return (
    <NavigationMenu.Root
      aria-label={ariaLabel}
      className="relative hidden justify-self-center xl:flex"
      delayDuration={90}
      skipDelayDuration={220}
      value={openGroup}
      onValueChange={changeOpenGroup}
    >
      <NavigationMenu.List className="flex list-none items-center gap-0.5">
        {groups.map((group) => {
          const active = activeGroupId === group.id;
          const expanded = openGroup === group.id;
          return (
            <NavigationMenu.Item key={group.id} value={group.id}>
              <NavigationMenu.Trigger
                ref={(node) => {
                  if (node) triggerRefs.current.set(group.id, node);
                  else triggerRefs.current.delete(group.id);
                }}
                className={cn(
                  "group flex h-8 items-center gap-1 rounded-md px-2.5 text-sm font-medium outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  active || expanded ? "text-foreground" : "text-subdued",
                )}
                data-public-nav-active={active ? "true" : undefined}
                data-public-nav-trigger={group.id}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;

                  event.preventDefault();
                  setOpenGroup((current) => (current === group.id ? "" : group.id));
                }}
              >
                {group.title}

                <ChevronDown
                  aria-hidden
                  className="size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none"
                />
              </NavigationMenu.Trigger>

              <NavigationMenu.Content
                forceMount
                className="absolute top-[calc(100%+0.75rem)] left-1/2 z-50 w-[min(64rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-border-strong bg-popover text-popover-foreground shadow-lg transition-[opacity,transform,visibility] duration-150 data-[state=closed]:pointer-events-none data-[state=closed]:invisible data-[state=closed]:translate-y-1 data-[state=closed]:opacity-0 data-[state=open]:visible data-[state=open]:translate-y-0 data-[state=open]:opacity-100 motion-reduce:transition-none"
                data-public-nav-surface={group.id}
                onEscapeKeyDown={() => {
                  setOpenGroup("");
                  triggerRefs.current.get(group.id)?.focus();
                }}
              >
                <div className="border-b border-border bg-sidebar/45 px-6 py-5">
                  <div className="flex items-center justify-between gap-8">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{group.title}</p>

                      <p className="mt-1 max-w-2xl text-sm leading-6 text-subdued">{group.description}</p>
                    </div>

                    <NavigationMenu.Link asChild active={isCurrentPage(pathname, group.featured.href)}>
                      <AppLink
                        appearance="unstyled"
                        aria-current={isCurrentPage(pathname, group.featured.href) ? "page" : undefined}
                        className={cn(
                          "group/link flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:bg-accent",
                          isCurrentPage(pathname, group.featured.href) && "bg-accent",
                        )}
                        href={group.featured.href}
                        onClick={navigate}
                      >
                        {group.featured.title}

                        <ArrowRight
                          aria-hidden
                          className="size-3.5 transition-transform group-hover/link:translate-x-0.5 motion-reduce:transition-none"
                        />
                      </AppLink>
                    </NavigationMenu.Link>
                  </div>
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
                          const linkActive = isCurrentPage(pathname, link.href) && isPrimaryPublicNavLink(group, link);

                          return (
                            <li key={`${link.href}-${link.title}`}>
                              <NavigationMenu.Link asChild active={linkActive}>
                                <AppLink
                                  appearance="unstyled"
                                  aria-current={linkActive ? "page" : undefined}
                                  className={cn(
                                    "flex min-h-9 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:bg-accent",
                                    linkActive && "bg-accent",
                                  )}
                                  href={link.href}
                                  onClick={navigate}
                                >
                                  {link.provider ? (
                                    <ProviderMark decorative provider={link.provider} size={18} />
                                  ) : null}

                                  {link.title}
                                </AppLink>
                              </NavigationMenu.Link>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))}
                </div>
              </NavigationMenu.Content>
            </NavigationMenu.Item>
          );
        })}

        <NavigationMenu.Item>
          <NavigationMenu.Link asChild active={isCurrentPage(pathname, "/pricing")}>
            <AppLink
              appearance="unstyled"
              aria-current={isCurrentPage(pathname, "/pricing") ? "page" : undefined}
              className={cn(
                "flex h-8 items-center rounded-md px-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent",
                !isCurrentPage(pathname, "/pricing") && "text-subdued",
              )}
              href="/pricing"
              onClick={navigate}
            >
              {pricingLabel}
            </AppLink>
          </NavigationMenu.Link>
        </NavigationMenu.Item>
      </NavigationMenu.List>
    </NavigationMenu.Root>
  );
}
