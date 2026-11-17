"use client";

import type { LucideIcon } from "lucide-react";

import { Bell, Filter, ListPlus, Pencil, Search, Sparkles, Webhook, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const AUTOMATION_PALETTE_KINDS = [
  "condition",
  "setField",
  "createRecord",
  "notify",
  "callWebhook",
  "agent",
] as const;
export type AutomationPaletteKind = (typeof AUTOMATION_PALETTE_KINDS)[number];

type Group = "condition" | "record" | "people" | "integrations" | "agent";

const ITEMS: Record<AutomationPaletteKind, { group: Group; icon: LucideIcon }> = {
  condition: { group: "condition", icon: Filter },
  setField: { group: "record", icon: Pencil },
  createRecord: { group: "record", icon: ListPlus },
  notify: { group: "people", icon: Bell },
  callWebhook: { group: "integrations", icon: Webhook },
  agent: { group: "agent", icon: Sparkles },
};

const GROUP_ORDER: Group[] = ["condition", "record", "people", "integrations", "agent"];

type Translate = ReturnType<typeof useTranslations>;

function itemText(t: Translate, kind: AutomationPaletteKind): { title: string; hint: string } {
  switch (kind) {
    case "condition":
      return { title: t("Automations.palette.condition.title"), hint: t("Automations.palette.condition.hint") };
    case "setField":
      return { title: t("Automations.palette.setField.title"), hint: t("Automations.palette.setField.hint") };
    case "createRecord":
      return { title: t("Automations.palette.createRecord.title"), hint: t("Automations.palette.createRecord.hint") };
    case "notify":
      return { title: t("Automations.palette.notify.title"), hint: t("Automations.palette.notify.hint") };
    case "callWebhook":
      return { title: t("Automations.palette.callWebhook.title"), hint: t("Automations.palette.callWebhook.hint") };
    case "agent":
      return { title: t("Automations.palette.agent.title"), hint: t("Automations.palette.agent.hint") };
  }
}

function groupLabel(t: Translate, group: Group): string {
  switch (group) {
    case "condition":
      return t("Automations.palette.groups.condition");
    case "record":
      return t("Automations.palette.groups.record");
    case "people":
      return t("Automations.palette.groups.people");
    case "integrations":
      return t("Automations.palette.groups.integrations");
    case "agent":
      return t("Automations.palette.groups.agent");
  }
}

type Props = {
  disabled: ReadonlySet<AutomationPaletteKind>;
  onPick: (kind: AutomationPaletteKind) => void;
  onClose: () => void;
};

export function AutomationPalette({ disabled, onPick, onClose }: Props) {
  const t = useTranslations();
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const term = query.trim().toLowerCase();
    return GROUP_ORDER.map((group) => ({
      group,
      kinds: AUTOMATION_PALETTE_KINDS.filter((kind) => {
        if (ITEMS[kind].group !== group) return false;
        if (!term) return true;
        const text = itemText(t, kind);
        return `${text.title} ${text.hint}`.toLowerCase().includes(term);
      }),
    })).filter((entry) => entry.kinds.length > 0);
  }, [query, t]);

  return (
    <div
      aria-label={t("Automations.palette.title")}
      className="flex flex-col gap-3 rounded-xl border bg-popover p-3 shadow-md"
      data-automation-palette=""
      role="group"
    >
      <div className="flex items-center gap-2">
        <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />

        <Input
          autoFocus
          aria-label={t("Automations.palette.search")}
          placeholder={t("Automations.palette.search")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <Button aria-label={t("Common.actions.close")} size="icon-xs" type="button" variant="ghost" onClick={onClose}>
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>

      {groups.length === 0 && <p className="text-sm text-muted-foreground">{t("Automations.palette.empty")}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map(({ group, kinds }) => (
          <div key={group} className="flex flex-col gap-1">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{groupLabel(t, group)}</p>

            {kinds.map((kind) => {
              const Icon = ITEMS[kind].icon;
              const text = itemText(t, kind);
              return (
                <button
                  key={kind}
                  className="flex items-start gap-2 rounded-md p-2 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  data-automation-palette-item={kind}
                  disabled={disabled.has(kind)}
                  type="button"
                  onClick={() => onPick(kind)}
                >
                  <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />

                  <span className="flex flex-col">
                    <span className="font-medium">{text.title}</span>

                    <span className="text-xs text-muted-foreground">{text.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
