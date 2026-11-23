"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  Blocks,
  BriefcaseBusiness,
  Hammer,
  Handshake,
  House,
  Inbox,
  Landmark,
  ListChecks,
  Loader2,
  PenLine,
  Search,
  Sparkles,
  TrendingUp,
  UserSearch,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import type {
  OnboardingTemplateCard,
  OnboardingTemplatePreselection,
} from "@/features/onboarding-templates/onboarding-template-offer";

import { AppCardFooter } from "@/components/card/app-card-footer";
import { OverflowRail } from "@/components/shared/overflow-rail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/core/utils/cn";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";

import { templateFamilyLabel } from "./onboarding-copy";
import { WIZARD_FOOTER_CLASS, WIZARD_FOOTER_GROUP_CLASS } from "./wizard-footer";

const TEMPLATE_INITIAL_LIMIT = 6;

type Props = {
  cards: readonly OnboardingTemplateCard[];
  preselection: OnboardingTemplatePreselection;
};

function matches(card: OnboardingTemplateCard, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  return needle === "" || `${card.name} ${card.summary}`.toLocaleLowerCase().includes(needle);
}

const FAMILY_ICONS: Record<OnboardingTemplateCard["family"], LucideIcon> = {
  clients: Handshake,
  community: UsersRound,
  content: PenLine,
  custom: Sparkles,
  intake: Inbox,
  investing: Landmark,
  operations: ListChecks,
  "professional-services": BriefcaseBusiness,
  property: House,
  recruiting: UserSearch,
  sales: TrendingUp,
  trades: Hammer,
};

function FamilyIcon({ family, className }: { family: OnboardingTemplateCard["family"]; className?: string }) {
  const Icon = FAMILY_ICONS[family];

  return (
    <span
      aria-hidden="true"
      className={cn("grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground", className)}
    >
      <Icon className="size-4" />
    </span>
  );
}

const TemplateCounts = ({ counts }: { counts: OnboardingTemplateCard["counts"] }) => {
  const t = useTranslations();

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/80">
      <Blocks aria-hidden="true" className="size-3.5 text-muted-foreground" />

      {counts.rules > 0
        ? t("OnboardingWizard.template.counts", counts)
        : t("OnboardingWizard.template.countsNoRules", counts)}
    </span>
  );
};

const TemplateRow = ({
  card,
  badge,
  disabled,
  selected,
}: {
  card: OnboardingTemplateCard;
  badge: string | null;
  disabled: boolean;
  selected: boolean;
}) => {
  const t = useTranslations();
  const id = `onboarding-template-${card.slug}`;

  return (
    <div className="relative min-w-0">
      <RadioGroupItem className="peer sr-only" disabled={disabled} id={id} value={card.slug} />

      <Label
        className={cn(
          "interactive-surface flex min-w-0 cursor-pointer items-start gap-3 rounded-lg p-2 text-left",
          "peer-data-[state=checked]:bg-primary/8 peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50",
          "peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
        )}
        htmlFor={id}
      >
        <FamilyIcon family={card.family} />

        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-foreground">{card.name}</span>

          <span className="truncate text-xs font-normal text-muted-foreground">
            {badge ?? templateFamilyLabel(t, card.family)}
          </span>

          {selected ? (
            <span className="mt-1 text-xs leading-relaxed font-normal text-muted-foreground md:hidden">
              {card.summary}
            </span>
          ) : null}
        </span>
      </Label>
    </div>
  );
};

const TemplateDetail = ({ card, badge }: { card: OnboardingTemplateCard | undefined; badge: string | null }) => {
  const t = useTranslations();

  if (!card) {
    return (
      <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground max-md:hidden">
        {t("OnboardingWizard.template.pickOne")}
      </div>
    );
  }

  return (
    <div
      aria-live="polite"
      className="flex flex-col gap-4 rounded-xl border border-border bg-muted/30 p-5 max-md:hidden"
      id="onboarding-template-detail"
    >
      <div className="flex items-center gap-3">
        <FamilyIcon className="size-10 rounded-xl" family={card.family} />

        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {[templateFamilyLabel(t, card.family), badge].filter(Boolean).join(" · ")}
          </span>

          <span className="text-base font-semibold text-foreground">{card.name}</span>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{card.summary}</p>

      <TemplateCounts counts={card.counts} />
    </div>
  );
};

export const StepTemplate = observer(({ cards, preselection }: Props) => {
  const t = useTranslations();
  const { onboardingWizardStore: store } = useRootStore();
  const [family, setFamily] = useState<OnboardingTemplateCard["family"] | "all">("all");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [pinned] = useState(store.selectedTemplate);
  const disabled = store.isSubmitting || store.isSaving || store.isInitializing;
  const families = [...new Set(cards.map((card) => card.family))];
  const filtered = cards.filter((card) => (family === "all" || card.family === family) && matches(card, query));
  const filtering = family !== "all" || query.trim() !== "";
  const selected = store.selectedTemplate;
  const selectedCard = cards.find((card) => card.slug === selected);
  const ordered = [
    ...filtered.filter((card) => card.slug === pinned),
    ...filtered.filter((card) => card.slug !== pinned),
  ];
  const limited = !showAll && !filtering && ordered.length > TEMPLATE_INITIAL_LIMIT;
  const visible = limited
    ? [
        ...ordered.slice(0, TEMPLATE_INITIAL_LIMIT),
        ...ordered.slice(TEMPLATE_INITIAL_LIMIT).filter((card) => card.slug === selected),
      ]
    : ordered;
  const badgeFor = (card: OnboardingTemplateCard) => {
    if (card.slug !== preselection.slug) return null;
    if (preselection.reason === "default") return t("OnboardingWizard.template.recommended");
    return preselection.reason === null ? null : t("OnboardingWizard.template.suggested");
  };

  return (
    <div className="flex flex-col gap-4">
      {cards.length > TEMPLATE_INITIAL_LIMIT || families.length > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <OverflowRail
            ariaLabel={t("OnboardingWizard.template.filtersLabel")}
            bleed={false}
            className="min-w-0 max-sm:w-full"
            railClassName="gap-2 sm:w-full sm:flex-wrap"
            railProps={{ "aria-label": t("OnboardingWizard.template.filtersLabel"), role: "group" }}
          >
            {(["all", ...families] as const).map((option) => (
              <Button
                key={option}
                aria-pressed={family === option}
                className="shrink-0 rounded-full"
                disabled={disabled}
                size="sm"
                type="button"
                variant={family === option ? "default" : "secondary"}
                onClick={() => setFamily(option)}
              >
                {option === "all" ? t("OnboardingWizard.template.filterAll") : templateFamilyLabel(t, option)}
              </Button>
            ))}
          </OverflowRail>

          <div className="relative w-full sm:w-56">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground"
            />

            <Input
              aria-label={t("OnboardingWizard.template.searchLabel")}
              className="pl-9"
              disabled={disabled}
              placeholder={t("OnboardingWizard.template.searchPlaceholder")}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground" role="status">
          {t("OnboardingWizard.template.empty")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <RadioGroup
            aria-label={t("OnboardingWizard.template.optionsLabel")}
            className="flex flex-col gap-1 md:max-h-[26rem] md:overflow-y-auto md:pr-1"
            disabled={disabled}
            value={selected ?? ""}
            onValueChange={store.setSelectedTemplate}
          >
            {visible.map((card) => (
              <TemplateRow
                key={card.slug}
                badge={badgeFor(card)}
                card={card}
                disabled={disabled}
                selected={card.slug === selected}
              />
            ))}
          </RadioGroup>

          <TemplateDetail badge={selectedCard ? badgeFor(selectedCard) : null} card={selectedCard} />
        </div>
      )}

      {limited || (showAll && !filtering && ordered.length > TEMPLATE_INITIAL_LIMIT) ? (
        <Button
          className="self-center"
          disabled={disabled}
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll
            ? t("OnboardingWizard.template.showFewer")
            : t("OnboardingWizard.template.browseAll", { count: cards.length })}
        </Button>
      ) : null}
    </div>
  );
});

export const StepTemplateFooter = observer(({ cards }: Pick<Props, "cards">) => {
  const t = useTranslations();
  const { onboardingWizardStore: store } = useRootStore();
  const busy = store.isSubmitting || store.isSaving || store.isInitializing;
  const selected = cards.find((card) => card.slug === store.selectedTemplate);

  return (
    <AppCardFooter className={WIZARD_FOOTER_CLASS}>
      <div className={WIZARD_FOOTER_GROUP_CLASS}>
        <Button
          disabled={busy || store.isFirstStep}
          id="onboarding-template-back"
          type="button"
          variant="ghost"
          onClick={() => runUserAction(store.back)}
        >
          {t("Common.actions.back")}
        </Button>

        <Button
          className="text-muted-foreground"
          disabled={busy}
          id="onboarding-template-none"
          type="button"
          variant="ghost"
          onClick={() => runUserAction(store.skipTemplate)}
        >
          {t("OnboardingWizard.template.none")}
        </Button>
      </div>

      <Button
        disabled={busy || !selected}
        id="onboarding-template-continue"
        type="button"
        onClick={() => runUserAction(store.confirmTemplate)}
      >
        {selected ? t("OnboardingWizard.template.use", { name: selected.name }) : t("OnboardingWizard.continue")}

        {store.isSubmitting ? (
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
        ) : (
          <ArrowRight aria-hidden="true" className="size-4" />
        )}
      </Button>
    </AppCardFooter>
  );
});
