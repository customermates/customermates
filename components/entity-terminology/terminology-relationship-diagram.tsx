"use client";

import type { LucideIcon } from "lucide-react";

import { Building2, ChevronDown, ChevronRight, Package, TrendingUp, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { EntityType } from "@/generated/prisma";

import type { TerminologySelectionMap } from "@/features/entity-terminology/entity-terminology.types";

import { cn } from "@/core/utils/cn";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import {
  CANONICAL_TERMINOLOGY_PRESET_KEY,
  ENTITY_TERMINOLOGY_PRESETS,
  isTerminologyPresetKey,
} from "@/features/entity-terminology/entity-terminology.constants";

import { useEntityTerminology } from "./use-entity-terminology";

type EntityStyle = {
  icon: LucideIcon;
  square: string;
  glyph: string;
  accent: string;
};

const ENTITY_STYLE: Record<string, EntityStyle> = {
  [EntityType.contact]: {
    icon: Users,
    square: "bg-blue-500/10",
    glyph: "text-blue-600 dark:text-blue-400",
    accent: "border-l-blue-500",
  },
  [EntityType.organization]: {
    icon: Building2,
    square: "bg-violet-500/10",
    glyph: "text-violet-600 dark:text-violet-400",
    accent: "border-l-violet-500",
  },
  [EntityType.deal]: {
    icon: TrendingUp,
    square: "bg-emerald-500/10",
    glyph: "text-emerald-600 dark:text-emerald-400",
    accent: "border-l-emerald-500",
  },
  [EntityType.service]: {
    icon: Package,
    square: "bg-amber-500/10",
    glyph: "text-amber-600 dark:text-amber-400",
    accent: "border-l-amber-500",
  },
};

const CARD_BASE = "w-full items-center gap-2.5 border-l-4 py-1.5 text-sm font-medium";

const CARD_SURFACE = "h-9 rounded-md border border-input bg-input-background px-3 shadow-xs";

type Props = {
  selections: TerminologySelectionMap;
  onPreset?: (entityType: EntityType, presetKey: string) => void;
  readOnly?: boolean;
  hideHeader?: boolean;
};

export function TerminologyRelationshipDiagram({ selections, onPreset, readOnly = false, hideHeader = false }: Props) {
  const t = useTranslations();
  const { presetLabel } = useEntityTerminology();

  const node = (entityType: EntityType) => {
    const style = ENTITY_STYLE[entityType];
    const Icon = style.icon;
    const selected = selections[entityType];
    const presetKey = isTerminologyPresetKey(entityType, selected)
      ? selected
      : CANONICAL_TERMINOLOGY_PRESET_KEY[entityType];

    const glyph = (
      <span className={cn("flex size-6 shrink-0 items-center justify-center rounded", style.square)}>
        <Icon aria-hidden="true" className={cn("size-3.5", style.glyph)} />
      </span>
    );

    if (readOnly || !onPreset) {
      return (
        <div className={cn(CARD_BASE, CARD_SURFACE, "flex", style.accent)}>
          {glyph}

          <span className="min-w-0 truncate">{presetLabel(entityType, presetKey, "plural")}</span>
        </div>
      );
    }

    return (
      <Select value={presetKey} onValueChange={(next) => onPreset(entityType, next)}>
        <SelectTrigger className={cn(CARD_BASE, "justify-between", style.accent)} id={`terminology-${entityType}`}>
          <span className="flex min-w-0 items-center gap-2.5">
            {glyph}

            <span className="min-w-0 truncate">{presetLabel(entityType, presetKey, "plural")}</span>
          </span>
        </SelectTrigger>

        <SelectContent>
          {ENTITY_TERMINOLOGY_PRESETS[entityType].map((key) => (
            <SelectItem key={key} value={key}>
              {presetLabel(entityType, key, "plural")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  const horizontalEdge = (edgeLabel: string) => (
    <div className="flex w-12 flex-col items-center sm:w-16">
      <span className="text-center text-[10px] font-medium uppercase leading-none tracking-wider text-muted-foreground">
        {edgeLabel}
      </span>

      <div className="flex w-full items-center text-muted-foreground/50">
        <div className="h-px flex-1 bg-current" />

        <ChevronRight aria-hidden="true" className="-ml-1.5 size-3 shrink-0" />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {!hideHeader && (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold">{t("EntityTerminology.relationships.dataModelTitle")}</span>

          <span className="text-xs text-muted-foreground">
            {t("EntityTerminology.relationships.dataModelSubtitle")}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 sm:gap-2">
          {node(EntityType.contact)}

          {horizontalEdge(t("EntityTerminology.relationships.workAt"))}

          {node(EntityType.organization)}
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-1.5 sm:gap-2">
          <div className="flex flex-col items-center gap-0.5 text-muted-foreground/50">
            <div className="h-2 w-px bg-current" />

            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("EntityTerminology.relationships.involvedIn")}
            </span>

            <div className="flex flex-col items-center">
              <div className="h-2 w-px bg-current" />

              <ChevronDown aria-hidden="true" className="-mt-1.5 size-3 shrink-0" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 sm:gap-2">
          {node(EntityType.deal)}

          {horizontalEdge(t("EntityTerminology.relationships.include"))}

          {node(EntityType.service)}
        </div>
      </div>
    </div>
  );
}
