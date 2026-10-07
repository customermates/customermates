"use client";

import type { NavGroup } from "./nav-main";

import { ListPlus, MoreHorizontal, RotateCcw } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppModal } from "@/components/modal";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useSidebar } from "@/components/ui/sidebar";
import { Icon } from "@/components/shared/icon";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";

import {
  SECTION_NAME_INPUT_ID,
  createSidebarSection,
  sectionLabel,
  useDeleteSidebarSection,
  useResolvedSidebar,
} from "./nav-sections";
import { isCustomSection, setSidebarItemHidden, sidebarLayoutOf } from "./sidebar-layout";

type Props = {
  groups: NavGroup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const SidebarCustomize = observer(({ groups, open, onOpenChange }: Props) => {
  const t = useTranslations();
  const { sidebarLayoutStore } = useRootStore();
  const { isMobile, setOpenMobile } = useSidebar();
  const { showConfirmation } = useDeleteConfirmation();
  const deleteSection = useDeleteSidebarSection(groups);
  const resolved = useResolvedSidebar(groups);
  const items = new Map(groups.flatMap((group) => group.items.map((item) => [item.key, item])));

  function editSection(sectionId: string) {
    sidebarLayoutStore.setEditingSection(sectionId);
    onOpenChange(false);
    if (isMobile) setOpenMobile(true);
  }

  function newSection() {
    const next = createSidebarSection(resolved, t("SidebarCustomize.newSectionName"));
    runUserAction(() => sidebarLayoutStore.save(sidebarLayoutOf(next.resolved)));
    editSection(next.id);
  }

  function reset() {
    onOpenChange(false);
    showConfirmation({
      title: t("SidebarCustomize.resetTitle"),
      message: t("SidebarCustomize.resetMessage"),
      confirmLabel: t("SidebarCustomize.reset"),
      successKey: "SidebarCustomize.resetDone",
      onConfirm: () => sidebarLayoutStore.save(null),
    });
  }

  return (
    <AppModal
      actions={[
        {
          id: "sidebar-customize-new-section",
          icon: ListPlus,
          label: t("SidebarCustomize.newSection"),
          onClick: newSection,
        },
        ...(sidebarLayoutStore.layout
          ? [{ id: "sidebar-customize-reset", icon: RotateCcw, label: t("SidebarCustomize.reset"), onClick: reset }]
          : []),
      ]}
      open={open}
      size="sm"
      title={t("SidebarCustomize.title")}
      onClose={() => onOpenChange(false)}
      onCloseAutoFocus={(event) => {
        if (!sidebarLayoutStore.editingSection) return;
        event.preventDefault();
        document.getElementById(SECTION_NAME_INPUT_ID)?.focus();
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
              const custom = isCustomSection(section.id);
              if (keys.length === 0 && !custom) return null;
              const label = sectionLabel(groups, section);
              return (
                <section
                  key={section.id}
                  aria-label={label}
                  className="flex flex-col gap-1"
                  data-customize-section={label}
                >
                  <div className="flex min-h-6 items-center justify-between gap-2">
                    <h3 className="truncate text-xs font-medium text-muted-foreground">{label}</h3>

                    {custom && (
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button
                            aria-label={t("SidebarCustomize.sectionActions", { section: label })}
                            size="icon-xs"
                            type="button"
                            variant="ghost"
                          >
                            <Icon icon={MoreHorizontal} />
                          </Button>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => editSection(section.id)}>
                            {t("SidebarCustomize.rename")}
                          </DropdownMenuItem>

                          <DropdownMenuSeparator />

                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => {
                              onOpenChange(false);
                              deleteSection(section.id, label);
                            }}
                          >
                            {t("SidebarCustomize.deleteSection")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  {keys.length === 0 && (
                    <p className="text-xs text-muted-foreground">{t("SidebarCustomize.emptySection")}</p>
                  )}

                  {keys.map((key) => {
                    const item = items.get(key);
                    if (!item) return null;
                    return (
                      <div key={key} className="flex items-center justify-between gap-3 py-0.5 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <Icon className="size-4 shrink-0 text-muted-foreground" icon={item.icon} />

                          <span className="truncate">{item.title}</span>
                        </span>

                        <Switch
                          aria-label={t("SidebarCustomize.show", { item: item.title })}
                          checked={!resolved.hidden.has(key)}
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
      </AppCard>
    </AppModal>
  );
});
