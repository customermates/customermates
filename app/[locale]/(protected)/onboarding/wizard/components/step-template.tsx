"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ArrowRight, Loader2, Search } from "lucide-react";
import { useState } from "react";

import type {
  OnboardingTemplateCard,
  OnboardingTemplatePreselection,
} from "@/features/onboarding-templates/onboarding-template-offer";

import { AppCardFooter } from "@/components/card/app-card-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";

import { templateFamilyLabel } from "./onboarding-copy";

export const TEMPLATE_INITIAL_LIMIT = 6;

type Props = {
  cards: readonly OnboardingTemplateCard[];
  preselection: OnboardingTemplatePreselection;
};

function matches(card: OnboardingTemplateCard, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  return needle === "" || `${card.name} ${card.summary}`.toLocaleLowerCase().includes(needle);
}

const TemplateCounts = ({ counts }: { counts: OnboardingTemplateCard["counts"] }) => {
  const t = useTranslations();

  return (
    <span className="text-xs font-medium text-foreground/80">
      {counts.rules > 0
        ? t("OnboardingWizard.template.counts", counts)
        : t("OnboardingWizard.template.countsNoRules", counts)}
    </span>
  );
};

const TemplateChoice = ({
  card,
  selected,
  badge,
  disabled,
}: {
  card: OnboardingTemplateCard;
  selected: boolean;
  badge: string | null;
  disabled: boolean;
}) => {
  const t = useTranslations();
  const id = `onboarding-template-${card.slug}`;

  return (
    <div className="relative min-w-0">
      <RadioGroupItem className="peer absolute top-3 right-3 z-10" disabled={disabled} id={id} value={card.slug} />

      <Label
        className={cn(
          "interactive-surface flex h-full min-w-0 max-w-full cursor-pointer flex-col items-start gap-2 rounded-xl border bg-input-background p-4 pr-10 text-left shadow-xs *:max-w-full",
          selected ? "border-2 border-primary bg-primary/5 p-[15px] pr-[39px]" : "border-input",
          "peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50",
          "peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
        )}
        htmlFor={id}
      >
        <span className="flex flex-wrap items-center gap-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {badge ?? templateFamilyLabel(t, card.family)}
        </span>

        <span className="text-sm leading-snug font-semibold wrap-anywhere text-foreground">{card.name}</span>

        <span className="text-xs leading-relaxed font-normal text-muted-foreground">{card.summary}</span>

        <span className="mt-auto w-full border-t border-border/70 pt-2">
          <TemplateCounts counts={card.counts} />
        </span>
      </Label>
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
          <div aria-label={t("OnboardingWizard.template.filtersLabel")} className="flex flex-wrap gap-2" role="group">
            {(["all", ...families] as const).map((option) => (
              <Button
                key={option}
                aria-pressed={family === option}
                className="rounded-full"
                disabled={disabled}
                size="sm"
                type="button"
                variant={family === option ? "default" : "secondary"}
                onClick={() => setFamily(option)}
              >
                {option === "all" ? t("OnboardingWizard.template.filterAll") : templateFamilyLabel(t, option)}
              </Button>
            ))}
          </div>

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
        <RadioGroup
          aria-label={t("OnboardingWizard.template.optionsLabel")}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          disabled={disabled}
          value={selected ?? ""}
          onValueChange={store.setSelectedTemplate}
        >
          {visible.map((card) => (
            <TemplateChoice
              key={card.slug}
              badge={badgeFor(card)}
              card={card}
              disabled={disabled}
              selected={card.slug === selected}
            />
          ))}
        </RadioGroup>
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
    <AppCardFooter className="justify-between">
      <div className="flex flex-wrap items-center gap-2">
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
