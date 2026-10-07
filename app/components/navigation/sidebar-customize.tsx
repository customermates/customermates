"use client";

import type { NavGroup } from "./nav-main";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppCardHeader } from "@/components/card/app-card-header";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Icon } from "@/components/shared/icon";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";

import { createSidebarSection, sectionLabel, useResolvedSidebar } from "./nav-sections";
import { setSidebarItemHidden, sidebarLayoutOf } from "./sidebar-layout";

type Props = {
  groups: NavGroup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const SidebarCustomize = observer(({ groups, open, onOpenChange }: Props) => {
  const t = useTranslations();
  const { sidebarLayoutStore } = useRootStore();
  const resolved = useResolvedSidebar(groups);
  const items = new Map(groups.flatMap((group) => group.items.map((item) => [item.key, item])));

  return (
    <AppModal
      open={open}
      size="sm"
      title={t("SidebarCustomize.title")}
      onClose={() => onOpenChange(false)}
      onCloseAutoFocus={(event) => {
        if (!sidebarLayoutStore.editingSection) return;
        event.preventDefault();
      }}
    >
      <AppCard>
        <AppCardHeader>
          <h2 className="text-x-lg grow">{t("SidebarCustomize.title")}</h2>
        </AppCardHeader>

        <AppCardBody>
          <div className="flex flex-col gap-3">
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
                          aria-label={t("SidebarCustomize.show", {
                            item: item.title,
                          })}
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
        </AppCardBody>

        <AppCardFooter>
          <div className="flex w-full flex-wrap justify-end gap-2">
            <Button
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => {
                runUserAction(() => sidebarLayoutStore.save(null));
                onOpenChange(false);
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
                onOpenChange(false);
              }}
            >
              {t("SidebarCustomize.newSection")}
            </Button>
          </div>
        </AppCardFooter>
      </AppCard>
    </AppModal>
  );
});
