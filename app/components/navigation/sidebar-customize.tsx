"use client";

import type { NavGroup } from "./nav-main";

import { SlidersHorizontal } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import { ResponsiveOverlay } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Icon } from "@/components/shared/icon";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";

import { createSidebarSection, sectionLabel, useResolvedSidebar } from "./nav-sections";
import { setSidebarItemHidden, sidebarLayoutOf } from "./sidebar-layout";

export const SidebarCustomize = observer(({ groups }: { groups: NavGroup[] }) => {
  const t = useTranslations();
  const { sidebarLayoutStore } = useRootStore();
  const [open, setOpen] = useState(false);
  const keepFocus = useRef(false);
  const resolved = useResolvedSidebar(groups);
  const items = new Map(groups.flatMap((group) => group.items.map((item) => [item.key, item])));

  return (
    <SidebarMenuItem>
      <ResponsiveOverlay
        align="start"
        footer={
          <div className="flex w-full flex-wrap justify-end gap-2">
            <Button
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => {
                runUserAction(() => sidebarLayoutStore.save(null));
                setOpen(false);
              }}
            >
              {t("SidebarCustomize.reset")}
            </Button>

            <Button
              size="sm"
              type="button"
              variant="secondary"
              onClick={() => {
                const next = createSidebarSection(resolved, t("SidebarCustomize.newSectionName"));
                runUserAction(() => sidebarLayoutStore.save(sidebarLayoutOf(next.resolved)));
                sidebarLayoutStore.setEditingSection(next.id);
                keepFocus.current = true;
                setOpen(false);
              }}
            >
              {t("SidebarCustomize.newSection")}
            </Button>
          </div>
        }
        open={open}
        popoverClassName="w-72"
        title={t("SidebarCustomize.title")}
        trigger={
          <SidebarMenuButton id="nav-customize-sidebar" size="sm" tooltip={t("SidebarCustomize.title")}>
            <Icon icon={SlidersHorizontal} />

            <span>{t("SidebarCustomize.title")}</span>
          </SidebarMenuButton>
        }
        onCloseAutoFocus={(event) => {
          if (!keepFocus.current) return;
          keepFocus.current = false;
          event.preventDefault();
        }}
        onOpenChange={setOpen}
      >
        <div className="flex flex-col gap-3 px-3 pb-3">
          {resolved.sections.map((section) => {
            const keys = section.items.filter((key) => items.has(key));
            if (keys.length === 0) return null;
            return (
              <section key={section.id} aria-label={sectionLabel(groups, section)} className="flex flex-col gap-1">
                <h3 className="text-xs font-medium text-muted-foreground">{sectionLabel(groups, section)}</h3>

                {keys.map((key) => {
                  const item = items.get(key);
                  if (!item) return null;
                  const shown = !resolved.hidden.has(key);
                  return (
                    <div key={key} className="flex items-center justify-between gap-3 py-0.5 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <Icon className="size-4 shrink-0 text-muted-foreground" icon={item.icon} />

                        <span className="truncate">{item.title}</span>
                      </span>

                      <Switch
                        aria-label={t("SidebarCustomize.show", { item: item.title })}
                        checked={shown}
                        onCheckedChange={(checked) =>
                          runUserAction(() =>
                            sidebarLayoutStore.save(sidebarLayoutOf(setSidebarItemHidden(resolved, key, !checked))),
                          )
                        }
                      />
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      </ResponsiveOverlay>
    </SidebarMenuItem>
  );
});
