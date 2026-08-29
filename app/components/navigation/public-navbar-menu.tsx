"use client";

import type { LucideIcon } from "lucide-react";

import { ArrowRight, ChevronDown } from "lucide-react";
import { NavigationMenu } from "radix-ui";
import { useRef, useState } from "react";

import { AppLink } from "@/components/shared/app-link";
import { Icon } from "@/components/shared/icon";
import { cn } from "@/core/utils/cn";

export type PublicNavLink = {
  href: string;
  title: string;
};

export type PublicNavGroup = {
  description: string;
  featured: PublicNavLink;
  icon: LucideIcon;
  id: string;
  secondary?: PublicNavLink;
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

function groupIsActive(pathname: string, group: PublicNavGroup) {
  return [
    group.featured,
    ...(group.secondary ? [group.secondary] : []),
    ...group.sections.flatMap((section) => section.links),
  ].some((link) => isPathActive(pathname, link.href));
}

export function PublicNavbarMenu({ ariaLabel, groups, onNavigate, pathname, pricingLabel }: Props) {
  const [openGroup, setOpenGroup] = useState("");
  const pinnedGroupRef = useRef("");
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());

  function changeOpenGroup(value: string) {
    setOpenGroup(value);
    if (!value) pinnedGroupRef.current = "";
  }

  function navigate() {
    setOpenGroup("");
    onNavigate();
  }

  function toggleGroup(groupId: string, expanded: boolean) {
    if (expanded && pinnedGroupRef.current === groupId) {
      pinnedGroupRef.current = "";
      setOpenGroup("");
      return;
    }

    pinnedGroupRef.current = groupId;
    setOpenGroup(groupId);
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
          const active = groupIsActive(pathname, group);
          const expanded = openGroup === group.id;
          const GroupIcon = group.icon;

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
                data-public-nav-trigger={group.id}
                onClick={(event) => {
                  event.preventDefault();
                  toggleGroup(group.id, expanded);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  toggleGroup(group.id, expanded);
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
                className="absolute top-[calc(100%+0.75rem)] left-1/2 z-50 w-[min(56rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-border-strong bg-popover text-popover-foreground shadow-lg transition-[opacity,transform,visibility] duration-150 data-[state=closed]:pointer-events-none data-[state=closed]:invisible data-[state=closed]:translate-y-1 data-[state=closed]:opacity-0 data-[state=open]:visible data-[state=open]:translate-y-0 data-[state=open]:opacity-100 motion-reduce:transition-none"
                data-public-nav-surface={group.id}
                onEscapeKeyDown={() => triggerRefs.current.get(group.id)?.focus()}
              >
                <div className="grid min-h-64 grid-cols-[15rem_minmax(0,1fr)]">
                  <div className="flex flex-col border-r border-border bg-sidebar/55 p-6">
                    <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-background text-foreground shadow-xs">
                      <Icon aria-hidden icon={GroupIcon} size="md" />
                    </span>

                    <p className="mt-5 text-sm font-semibold text-foreground">{group.title}</p>

                    <p className="mt-2 text-sm leading-6 text-subdued">{group.description}</p>

                    <div className="mt-auto space-y-1 pt-5">
                      {[group.featured, ...(group.secondary ? [group.secondary] : [])].map((link, index) => (
                        <NavigationMenu.Link key={link.href} asChild active={isCurrentPage(pathname, link.href)}>
                          <AppLink
                            appearance="unstyled"
                            aria-current={isCurrentPage(pathname, link.href) ? "page" : undefined}
                            className={cn(
                              "group/link flex min-h-9 items-center justify-between gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors hover:bg-accent focus-visible:bg-accent",
                              index > 0 && "text-subdued hover:text-foreground",
                              isCurrentPage(pathname, link.href) && "bg-accent text-foreground",
                            )}
                            href={link.href}
                            onClick={navigate}
                          >
                            {link.title}

                            <ArrowRight
                              aria-hidden
                              className="size-3.5 shrink-0 transition-transform group-hover/link:translate-x-0.5 motion-reduce:transition-none"
                            />
                          </AppLink>
                        </NavigationMenu.Link>
                      ))}
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
                        <h2
                          className="text-xs font-medium uppercase tracking-[0.14em] text-subdued"
                          id={`public-nav-${group.id}-${sectionIndex}`}
                        >
                          {section.title}
                        </h2>

                        <ul
                          className={cn(
                            "mt-3 space-y-1",
                            group.sections.length === 1 && "grid max-w-2xl grid-cols-2 gap-x-8 space-y-0",
                          )}
                        >
                          {section.links.map((link) => {
                            const linkActive = isCurrentPage(pathname, link.href);

                            return (
                              <li key={link.href}>
                                <NavigationMenu.Link asChild active={linkActive}>
                                  <AppLink
                                    appearance="unstyled"
                                    aria-current={linkActive ? "page" : undefined}
                                    className={cn(
                                      "block rounded-md px-2.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:bg-accent",
                                      linkActive && "bg-accent",
                                    )}
                                    href={link.href}
                                    onClick={navigate}
                                  >
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
