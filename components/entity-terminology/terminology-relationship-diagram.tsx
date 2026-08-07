"use client";

import type { LucideIcon } from "lucide-react";

import { Building2, CheckCircle2, Package, TrendingUp, Users } from "lucide-react";
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
};

const ENTITY_STYLE: Record<EntityType, EntityStyle> = {
  [EntityType.contact]: {
    icon: Users,
    square: "bg-blue-500/10",
    glyph: "text-blue-600 dark:text-blue-400",
  },
  [EntityType.organization]: {
    icon: Building2,
    square: "bg-violet-500/10",
    glyph: "text-violet-600 dark:text-violet-400",
  },
  [EntityType.deal]: {
    icon: TrendingUp,
    square: "bg-emerald-500/10",
    glyph: "text-emerald-600 dark:text-emerald-400",
  },
  [EntityType.service]: {
    icon: Package,
    square: "bg-amber-500/10",
    glyph: "text-amber-600 dark:text-amber-400",
  },
  [EntityType.task]: {
    icon: CheckCircle2,
    square: "bg-cyan-500/10",
    glyph: "text-cyan-600 dark:text-cyan-400",
  },
};

const CARD_BASE = "w-full items-center gap-2.5 py-1.5 text-sm font-medium";

const CARD_SURFACE = "h-9 rounded-md border border-input bg-input-background px-3 shadow-xs";

type Props = {
  selections: TerminologySelectionMap;
  onPreset?: (entityType: EntityType, presetKey: string) => void;
  readOnly?: boolean;
};

export function TerminologyRelationshipDiagram({ selections, onPreset, readOnly = false }: Props) {
  const t = useTranslations();
  const { presetLabel } = useEntityTerminology();

  const selectedPresetKey = (entityType: EntityType) => {
    const selected = selections[entityType];
    return isTerminologyPresetKey(entityType, selected) ? selected : CANONICAL_TERMINOLOGY_PRESET_KEY[entityType];
  };

  const entityLabel = (entityType: EntityType) => presetLabel(entityType, selectedPresetKey(entityType), "plural");
  const taskScopeLabel = t("EntityTerminology.relationships.taskScope", {
    tasks: entityLabel(EntityType.task),
  });

  const node = (entityType: EntityType) => {
    const style = ENTITY_STYLE[entityType];
    const Icon = style.icon;
    const presetKey = selectedPresetKey(entityType);

    const glyph = (
      <span className={cn("flex size-6 shrink-0 items-center justify-center rounded", style.square)}>
        <Icon aria-hidden="true" className={cn("size-3.5", style.glyph)} />
      </span>
    );

    if (readOnly || !onPreset) {
      return (
        <div className={cn(CARD_BASE, CARD_SURFACE, "flex")}>
          {glyph}

          <span className="min-w-0 truncate">{presetLabel(entityType, presetKey, "plural")}</span>
        </div>
      );
    }

    return (
      <Select value={presetKey} onValueChange={(next) => onPreset(entityType, next)}>
        <SelectTrigger
          aria-label={t("EntityTerminology.relationships.selectLabel", {
            entity: presetLabel(entityType, presetKey, "singular"),
          })}
          className={cn(CARD_BASE, "justify-between")}
          id={`terminology-${entityType}`}
        >
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

  const relationshipList = () => (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-foreground">
        {t("EntityTerminology.relationships.howRecordsConnect")}
      </span>

      <ul className="grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2">
        <li className="rounded-md border bg-muted/20 px-2.5 py-2" data-relationship="contact-organization">
          {t("EntityTerminology.relationships.contactOrganizationSummary", {
            contacts: entityLabel(EntityType.contact),
            organizations: entityLabel(EntityType.organization),
          })}
        </li>

        <li className="rounded-md border bg-muted/20 px-2.5 py-2" data-relationship="contact-deal">
          {t("EntityTerminology.relationships.contactDealSummary", {
            contacts: entityLabel(EntityType.contact),
            deals: entityLabel(EntityType.deal),
          })}
        </li>

        <li className="rounded-md border bg-muted/20 px-2.5 py-2" data-relationship="organization-deal">
          {t("EntityTerminology.relationships.organizationDealSummary", {
            deals: entityLabel(EntityType.deal),
            organizations: entityLabel(EntityType.organization),
          })}
        </li>

        <li className="rounded-md border bg-muted/20 px-2.5 py-2" data-relationship="deal-service">
          {t("EntityTerminology.relationships.dealServiceSummary", {
            deals: entityLabel(EntityType.deal),
            services: entityLabel(EntityType.service),
          })}
        </li>
      </ul>
    </div>
  );

  const relationshipMap = () => (
    <>
      <div className="relative">
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden size-full text-border sm:block"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          <line
            data-relationship="contact-organization"
            stroke="currentColor"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            x1="42"
            x2="58"
            y1="13"
            y2="13"
          />

          <line
            data-relationship="contact-deal"
            stroke="currentColor"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            x1="21"
            x2="21"
            y1="26"
            y2="74"
          />

          <line
            data-relationship="organization-deal"
            stroke="currentColor"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            x1="79"
            x2="21"
            y1="26"
            y2="74"
          />

          <line
            data-relationship="deal-service"
            stroke="currentColor"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            x1="42"
            x2="58"
            y1="87"
            y2="87"
          />
        </svg>

        <div className="relative z-10 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-x-24 sm:gap-y-16">
          {node(EntityType.contact)}

          {node(EntityType.organization)}

          {node(EntityType.deal)}

          {node(EntityType.service)}
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-2 z-20 hidden -translate-x-1/2 bg-background px-1.5 text-[10px] text-muted-foreground sm:block"
        >
          {t("EntityTerminology.relationships.workAt")}
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-[21%] top-1/2 z-20 hidden -translate-1/2 bg-background px-1.5 text-[10px] text-muted-foreground sm:block"
        >
          {t("EntityTerminology.relationships.involvedIn")}
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-[59%] top-1/2 z-20 hidden -translate-1/2 bg-background px-1.5 text-[10px] text-muted-foreground sm:block"
        >
          {t("EntityTerminology.relationships.linkedTo")}
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-2 left-1/2 z-20 hidden -translate-x-1/2 bg-background px-1.5 text-[10px] text-muted-foreground sm:block"
        >
          {t("EntityTerminology.relationships.include")}
        </div>
      </div>

      <div className="sr-only">{relationshipList()}</div>
    </>
  );

  return (
    <section aria-labelledby="terminology-data-model-label" className="flex flex-col gap-1.5">
      <p className="text-xs font-normal text-muted-foreground" id="terminology-data-model-label">
        {t("EntityTerminology.relationships.dataModelLabel")}
      </p>

      <div className="flex flex-col">
        {relationshipMap()}

        <div aria-labelledby="terminology-task-relationship-label" className="flex flex-col items-center" role="group">
          <div className="relative flex min-h-6 w-full items-center justify-center sm:min-h-14 sm:py-2">
            <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />

            <span
              className="sr-only sm:not-sr-only sm:relative sm:z-10 sm:max-w-[calc(100%-2rem)] sm:bg-background sm:px-2 sm:text-center sm:text-[10px] sm:leading-relaxed sm:text-muted-foreground"
              id="terminology-task-relationship-label"
            >
              {taskScopeLabel}
            </span>
          </div>

          <div data-task-selector className="w-full">
            {node(EntityType.task)}
          </div>
        </div>
      </div>
    </section>
  );
}
