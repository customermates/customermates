"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { ChevronDown } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useRootStore } from "@/core/stores/root-store.provider";
import { IntlLink } from "@/i18n/navigation";

import { ShellHeader } from "./shell-header";
import { useTopBarActions } from "./topbar-actions-context";
import { WORKSPACE_SECTIONS, visibleSubroutes, type WorkspaceSection } from "./navigation/workspace-sections";

import type { AppMode } from "@/core/config/environment";
import type { Resource } from "@/generated/prisma";

type Sibling = { slug: string; label: string };
type Crumb = { label: string; href?: string; siblings?: Sibling[]; pictureUrl?: string | null; isEntity?: boolean };

const GROUP_MAP: Record<string, { group: "overview" | "crm" | "settings" | null; label: string }> = {
  dashboard: { group: "overview", label: "dashboard" },
  inbox: { group: "overview", label: "inbox" },
  tasks: { group: "overview", label: "tasks" },
  contacts: { group: "crm", label: "contacts" },
  organizations: { group: "crm", label: "organizations" },
  deals: { group: "crm", label: "deals" },
  services: { group: "crm", label: "services" },
  settings: { group: "settings", label: "settings" },
  profile: { group: "settings", label: "profile" },
  company: { group: "settings", label: "company" },
};

function isWorkspaceSection(segment: string): segment is WorkspaceSection {
  return segment === "profile" || segment === "company";
}

export const AppTopBar = observer(() => {
  const t = useTranslations();
  const pathname = usePathname();
  const rootStore = useRootStore();
  const { layoutStore, userStore } = rootStore;
  const { actions, override } = useTopBarActions();

  const { crumbs, section } = useMemo(
    () =>
      buildCrumbs(
        pathname,
        t,
        layoutStore.runtimeTitle,
        layoutStore.runtimePictureUrl,
        layoutStore.runtimeAvatarKind !== null,
        rootStore.appMode,
        userStore.canAccess,
      ),
    [
      pathname,
      t,
      layoutStore.runtimeTitle,
      layoutStore.runtimePictureUrl,
      layoutStore.runtimeAvatarKind,
      rootStore.appMode,
      userStore.user,
    ],
  );

  if (crumbs.length === 0) return <ShellHeader actions={override ?? actions} />;

  return (
    <ShellHeader actions={override ?? actions}>
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="flex-nowrap">
          {crumbs.map((c, i) => {
            const isLeaf = i === crumbs.length - 1;
            const hasSectionDropdown = Boolean(section) && crumbs.some((cr) => cr.siblings);
            const hideOnMobile = !isLeaf && hasSectionDropdown;
            return (
              <span
                key={i}
                className={cn(
                  "flex items-center gap-1.5 shrink-0",
                  isLeaf && "min-w-0 shrink",
                  hideOnMobile && "hidden lg:flex",
                )}
              >
                {i > 0 && <BreadcrumbSeparator className={cn("shrink-0", hasSectionDropdown && "hidden lg:flex")} />}

                <BreadcrumbItem className={cn(isLeaf ? "min-w-0" : "shrink-0")}>
                  {isLeaf && c.siblings && section ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger className="flex min-w-0 items-center gap-1 rounded-md text-foreground outline-none hover:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">
                        <span className="truncate">{c.label}</span>

                        <ChevronDown className="size-3.5 shrink-0 opacity-60" />
                      </DropdownMenuTrigger>

                      <DropdownMenuContent align="start">
                        {c.siblings.map((s) => (
                          <DropdownMenuItem key={s.slug} asChild>
                            <IntlLink href={`/${section}/${s.slug}`}>{s.label}</IntlLink>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : c.href && !isLeaf ? (
                    <BreadcrumbLink asChild>
                      <IntlLink href={c.href}>{c.label}</IntlLink>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage className="flex min-w-0 items-center gap-1.5 truncate">
                      {isLeaf && c.isEntity && <Avatar name={c.label} size="sm" src={c.pictureUrl ?? null} />}

                      <span className="truncate">{c.label}</span>
                    </BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </span>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </ShellHeader>
  );
});

function buildCrumbs(
  pathname: string,
  t: (k: string) => string,
  runtimeTitle: string | null,
  runtimePictureUrl: string | null,
  showLeafAvatar: boolean,
  appMode: AppMode,
  canAccess: (resource: Resource) => boolean,
): { crumbs: Crumb[]; section: string | null } {
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length <= 1) return { crumbs: [], section: null };
  const parts = segs.slice(1);

  const first = parts[0];
  const entry = GROUP_MAP[first];
  if (!entry) return { crumbs: [], section: null };

  const workspaceSection = isWorkspaceSection(first) ? first : null;
  const sectionSubroutes = workspaceSection ? visibleSubroutes(workspaceSection, appMode, canAccess) : [];

  const crumbs: Crumb[] = [];
  const leafKey = entry.group === "settings" ? `UserAvatar.${entry.label}` : `NavigationBar.${entry.label}`;
  const sectionHref = workspaceSection ? `/${first}/${sectionSubroutes[0]?.slug ?? "settings"}` : `/${first}`;
  crumbs.push({ label: t(leafKey), href: sectionHref });

  if (parts.length > 1) {
    const leaf = parts[1];
    const subroute = workspaceSection ? WORKSPACE_SECTIONS[workspaceSection].find((s) => s.slug === leaf) : undefined;
    if (subroute) {
      const siblings: Sibling[] = sectionSubroutes.map((s) => ({ slug: s.slug, label: t(s.labelKey) }));
      crumbs.push({ label: t(subroute.labelKey), siblings });
    } else {
      const fallback = leaf.length > 10 ? `${leaf.slice(0, 8)}…` : leaf;
      crumbs.push({
        label: runtimeTitle ?? fallback,
        pictureUrl: runtimePictureUrl,
        isEntity: showLeafAvatar,
      });
    }
  }

  if (first === "inbox" && runtimeTitle)
    crumbs.push({ label: runtimeTitle, pictureUrl: runtimePictureUrl, isEntity: showLeafAvatar });

  return { crumbs, section: workspaceSection };
}
