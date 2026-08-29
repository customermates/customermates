"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AppLink } from "@/components/shared/app-link";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/core/utils/cn";

export type PublicNavLink = {
  href: string;
  title: string;
};

export type PublicNavGroup = {
  columns: {
    links: PublicNavLink[];
    title: string;
  }[];
  id: string;
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

export function PublicNavbarMenu({ ariaLabel, groups, onNavigate, pathname, pricingLabel }: Props) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const menuRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!(event.target instanceof Element)) return;
      if (menuRef.current?.contains(event.target) || event.target.closest("[data-public-nav-surface]")) return;
      setOpenGroup(null);
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  function navigate() {
    setOpenGroup(null);
    onNavigate();
  }

  return (
    <nav ref={menuRef} aria-label={ariaLabel} className="hidden items-center gap-1 lg:flex">
      {groups.map((group) => {
        const active = group.columns.some((column) => column.links.some((link) => isPathActive(pathname, link.href)));
        const expanded = openGroup === group.id;

        return (
          <Popover key={group.id} open={expanded} onOpenChange={(open) => setOpenGroup(open ? group.id : null)}>
            <div onPointerEnter={() => setOpenGroup(group.id)}>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    "flex h-9 items-center gap-1 rounded-md px-3 text-sm font-medium outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    active || expanded ? "text-foreground" : "text-subdued",
                  )}
                  data-public-nav-trigger={group.id}
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    setOpenGroup(group.id);
                  }}
                >
                  {group.title}

                  <ChevronDown
                    aria-hidden
                    className={cn("size-3.5 transition-transform duration-200", expanded && "rotate-180")}
                  />
                </button>
              </PopoverTrigger>

              <PopoverContent
                data-public-nav-surface
                align="center"
                className="w-[min(72rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] rounded-lg bg-background/98 p-0 backdrop-blur-xl"
                id={`public-nav-${group.id}`}
                sideOffset={12}
                onEscapeKeyDown={(event) => {
                  event.preventDefault();
                  setOpenGroup(null);
                  document.querySelector<HTMLButtonElement>(`[data-public-nav-trigger="${group.id}"]`)?.focus();
                }}
                onPointerEnter={() => setOpenGroup(group.id)}
                onPointerLeave={(event) => {
                  if (event.currentTarget.contains(document.activeElement)) return;
                  setOpenGroup(null);
                }}
              >
                <div className="grid gap-10 px-6 py-9 lg:grid-cols-3 xl:px-8">
                  {group.columns.map((column, columnIndex) => (
                    <section key={column.title} aria-labelledby={`public-nav-${group.id}-${columnIndex}`}>
                      <h2
                        className="text-xs font-medium uppercase tracking-[0.14em] text-subdued"
                        id={`public-nav-${group.id}-${columnIndex}`}
                      >
                        {column.title}
                      </h2>

                      <ul className="mt-4 space-y-1">
                        {column.links.map((link) => (
                          <li key={link.href}>
                            <AppLink
                              appearance="unstyled"
                              className={cn(
                                "block rounded-md px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:bg-accent",
                                isPathActive(pathname, link.href) && "bg-accent",
                              )}
                              href={link.href}
                              onClick={navigate}
                            >
                              {link.title}
                            </AppLink>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              </PopoverContent>
            </div>
          </Popover>
        );
      })}

      <AppLink
        className={cn(
          "rounded-md px-3 py-2 text-sm font-medium",
          !isPathActive(pathname, "/pricing") && "text-subdued",
        )}
        href="/pricing"
        onClick={navigate}
      >
        {pricingLabel}
      </AppLink>
    </nav>
  );
}
