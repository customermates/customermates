"use client";

import type { ReactNode } from "react";
import type { AppModalActions } from "@/components/modal";
import type { BaseModalStore } from "@/core/base/base-modal.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppModal } from "@/components/modal";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useIsWiderThan } from "@/hooks/use-media-query";

export type AutomationRuntimeBadge = {
  label: string;
  variant: "secondary" | "ink" | "outline";
};

export type AutomationDrawerMeta = {
  owner: {
    name: string;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string | null;
  } | null;
  runtime: AutomationRuntimeBadge;
  lastRun: string;
};

export type AutomationDrawerActive = {
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
};

type Props = {
  store: BaseModalStore;
  idPrefix: string;
  title: string;
  name: string;
  actions: AppModalActions;
  active: AutomationDrawerActive | null;
  meta: AutomationDrawerMeta;
  banner?: ReactNode;
  notices?: ReactNode;
  canvas: ReactNode;
  panel: ReactNode;
  panelLabel: string;
  sheetOpen: boolean;
  footer?: ReactNode;
};

export const AutomationDrawerShell = observer(function AutomationDrawerShell({
  store,
  idPrefix,
  title,
  name,
  actions,
  active,
  meta,
  banner,
  notices,
  canvas,
  panel,
  panelLabel,
  sheetOpen,
  footer,
}: Props) {
  const t = useTranslations();
  const wide = useIsWiderThan("lg");
  const activeId = `${idPrefix}-active`;

  const activeControl = active ? (
    <div className="flex shrink-0 items-center gap-2" data-automation-active="">
      <Switch checked={active.checked} disabled={active.disabled} id={activeId} onCheckedChange={active.onChange} />

      <Label className="text-sm" htmlFor={activeId}>
        {active.checked ? t("Automations.builder.active") : t("Automations.builder.paused")}
      </Label>
    </div>
  ) : null;

  return (
    <AppModal
      focusContentOnOpen
      actions={actions}
      controls={activeControl ? { node: activeControl, slots: 2 } : undefined}
      description={name}
      size="5xl"
      store={store}
      title={title}
    >
      <AppCard className="relative overflow-hidden" data-automation-drawer={idPrefix}>
        <AppCardHeader className="pb-4">
          <h2 className="min-w-0 flex-1 truncate text-x-lg" data-automation-drawer-name="">
            {name}
          </h2>
        </AppCardHeader>

        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-1 border-y bg-muted/40 px-6 py-2 text-xs text-muted-foreground"
          data-automation-drawer-meta=""
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {meta.owner ? (
              <Avatar
                name={
                  meta.owner.firstName !== undefined ? [meta.owner.firstName, meta.owner.lastName] : meta.owner.name
                }
                size="sm"
                src={meta.owner.avatarUrl}
              />
            ) : (
              <Avatar fallback="—" size="sm" />
            )}

            <span className="truncate">
              {meta.owner ? t("Automations.canvas.runsAs", { name: meta.owner.name }) : t("Automations.canvas.noOwner")}
            </span>
          </span>

          <Badge data-automation-runtime="" variant={meta.runtime.variant}>
            {meta.runtime.label}
          </Badge>

          <span>{meta.lastRun}</span>

          {banner}
        </div>

        {notices && <div className="flex flex-col gap-2 px-6 pt-4">{notices}</div>}

        {wide ? (
          <div className="grid h-[min(40rem,calc(100dvh-16rem))] min-h-[28rem] grid-cols-[minmax(0,1fr)_22.5rem]">
            <div className="relative min-h-0 border-e pb-[var(--unsaved-changes-bar-space,0px)]">{canvas}</div>

            <aside
              aria-label={panelLabel}
              className="flex min-h-0 flex-col overflow-y-auto overscroll-contain scroll-pb-[var(--unsaved-changes-bar-space,0px)] pb-[var(--unsaved-changes-bar-space,0px)]"
              data-automation-panel=""
            >
              {panel}
            </aside>
          </div>
        ) : (
          <div className="flex min-h-0 flex-col overflow-y-auto overscroll-contain scroll-pb-[var(--unsaved-changes-bar-space,0px)] pb-[var(--unsaved-changes-bar-space,0px)]">
            {canvas}

            {sheetOpen ? (
              <aside
                aria-label={panelLabel}
                className="sticky bottom-0 z-10 flex max-h-[75dvh] flex-col overflow-hidden rounded-t-2xl border-t border-border-strong bg-card shadow-lg"
                data-automation-panel="sheet"
              >
                <div className="min-h-0 overflow-y-auto overscroll-contain pb-[var(--safe-bottom)]">{panel}</div>
              </aside>
            ) : (
              <aside aria-label={panelLabel} className="border-t" data-automation-panel="">
                {panel}
              </aside>
            )}
          </div>
        )}

        {footer}
      </AppCard>
    </AppModal>
  );
});
