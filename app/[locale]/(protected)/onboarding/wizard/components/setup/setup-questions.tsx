"use client";

import type { SetupQuestionPart } from "@/features/workspace-setup/setup-interview";

import { ArrowRight, Loader2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { AppCardFooter } from "@/components/card/app-card-footer";
import { ConfirmDialog } from "@/components/modal/confirm-dialog";
import { Kbd } from "@/components/keyboard/shortcut-keys";
import { SelectableCard } from "@/components/forms/selectable-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";

import { WIZARD_FOOTER_CLASS, WIZARD_FOOTER_GROUP_CLASS } from "../wizard-footer";
import { SetupCustomEntry } from "./setup-choice-chips";
import { displayedAnswerValue, partVisible } from "./setup-interview-state";
import { partDescriptor } from "./setup-question-descriptor";
import { SetupQuestionField } from "./setup-question-field";

const VISIBLE_CHOICES = 5;
const ROW_CLASS = "min-h-12 flex-row items-center justify-between gap-3 py-3";

function KeyHint({ index }: { index: number }) {
  return (
    <span aria-hidden="true" className="shrink-0 max-sm:hidden">
      <Kbd>{index + 1}</Kbd>
    </span>
  );
}

function useSuggestedSteps(): string[] {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const suggestion = store.stepSuggestion;
  return suggestion ? (t.raw(`WorkspaceSetup.suggestedSteps.${suggestion}`) as string[]) : [];
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA";
}

function useContinue() {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const steps = useSuggestedSteps();
  return () => {
    if (store.nextQuestion(t("Common.errors.mustNotBeBlank"), steps)) runUserAction(store.showPlan);
  };
}

const ChoiceRows = observer(function ChoiceRows({
  part,
  numbered,
}: {
  part: Extract<SetupQuestionPart, { format: "singleChoice" }>;
  numbered: boolean;
}) {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const advance = useContinue();
  const descriptor = partDescriptor(part, t, store.answers);
  const value = displayedAnswerValue(part, store.answers);
  const options = descriptor.format === "singleChoice" ? descriptor.options : [];
  const pick = (id: string) => {
    store.setAnswer(part.id, { format: "singleChoice", value: id });
    if (numbered) advance();
  };

  useEffect(() => {
    if (!numbered) return;
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      const option = options[Number(event.key) - 1];
      if (!option || store.isBusy) return;
      event.preventDefault();
      pick(option.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <RadioGroup
      aria-invalid={store.answerMissing(part.id) || undefined}
      aria-label={descriptor.label}
      className="grid grid-cols-1 gap-2"
      disabled={store.isBusy}
      value={value?.format === "singleChoice" ? value.value : ""}
      onValueChange={pick}
    >
      {options.map((option, index) => (
        <SelectableCard
          key={option.id}
          disabled={store.isBusy}
          id={`setup-${part.id}-${option.id}`}
          label={option.label}
          labelClassName={ROW_CLASS}
          selectionMode="single"
          value={option.id}
          visual={numbered && index < 9 ? <KeyHint index={index} /> : undefined}
        />
      ))}
    </RadioGroup>
  );
});

const CheckRows = observer(function CheckRows({
  part,
}: {
  part: Extract<SetupQuestionPart, { format: "multipleChoice" }>;
}) {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const [expanded, setExpanded] = useState(false);
  const descriptor = partDescriptor(part, t, store.answers);
  const value = displayedAnswerValue(part, store.answers);
  const values = value?.format === "multipleChoice" ? value.values : [];
  const custom = value?.format === "multipleChoice" ? value.custom : [];
  const options = descriptor.format === "multipleChoice" ? descriptor.options : [];
  const shown = expanded
    ? options
    : options.filter((option, index) => index < VISIBLE_CHOICES || values.includes(option.id));
  const hidden = options.length - shown.length;
  const update = (next: { values?: string[]; custom?: string[] }) =>
    store.setAnswer(part.id, {
      format: "multipleChoice",
      values: next.values ?? values,
      custom: next.custom ?? custom,
    });

  return (
    <div aria-label={descriptor.label} className="flex flex-col gap-2" role="group">
      {shown.map((option) => (
        <SelectableCard
          key={option.id}
          checked={values.includes(option.id)}
          disabled={store.isBusy}
          id={`setup-${part.id}-${option.id}`}
          label={option.label}
          labelClassName={ROW_CLASS}
          selectionMode="multiple"
          onCheckedChange={(checked) =>
            update({ values: checked ? [...values, option.id] : values.filter((id) => id !== option.id) })
          }
        />
      ))}

      {custom.map((entry, index) => (
        <SelectableCard
          key={entry}
          checked
          disabled={store.isBusy}
          id={`setup-${part.id}-custom-${index}`}
          label={entry}
          labelClassName={ROW_CLASS}
          selectionMode="multiple"
          onCheckedChange={(checked) => {
            if (!checked) update({ custom: custom.filter((candidate) => candidate !== entry) });
          }}
        />
      ))}

      <div className="flex flex-wrap items-center gap-2">
        {hidden > 0 ? (
          <Button
            disabled={store.isBusy}
            id={`setup-${part.id}-more`}
            size="sm"
            type="button"
            variant="link"
            onClick={() => setExpanded(true)}
          >
            {t("WorkspaceSetup.interview.showMore", { count: hidden })}
          </Button>
        ) : null}

        {part.allowCustom && custom.length < 10 ? (
          <SetupCustomEntry
            disabled={store.isBusy}
            onAdd={(entry) => {
              if (!custom.some((candidate) => candidate.toLowerCase() === entry.toLowerCase()))
                update({ custom: [...custom, entry] });
            }}
          />
        ) : null}
      </div>
    </div>
  );
});

const ExampleRecordsToggle = observer(function ExampleRecordsToggle({ part }: { part: SetupQuestionPart }) {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const value = displayedAnswerValue(part, store.answers);
  const checked = value?.format === "singleChoice" && value.value === "sampleData";

  return (
    <div className="flex min-h-14 items-center justify-between gap-4 rounded-md border border-input bg-input-background p-3 shadow-xs">
      <Label className="flex min-w-0 cursor-pointer flex-col items-start gap-0.5" htmlFor="setup-existingData">
        <span className="text-sm font-medium">{t("WorkspaceSetup.questions.existingData.label")}</span>

        <span className="text-xs font-normal text-muted-foreground">
          {t("WorkspaceSetup.questions.existingData.description")}
        </span>
      </Label>

      <Switch
        checked={checked}
        disabled={store.isBusy}
        id="setup-existingData"
        onCheckedChange={(next) =>
          store.setAnswer(part.id, { format: "singleChoice", value: next ? "sampleData" : "empty" })
        }
      />
    </div>
  );
});

const QuestionPart = observer(function QuestionPart({
  part,
  numbered,
}: {
  part: SetupQuestionPart;
  numbered: boolean;
}) {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const steps = useSuggestedSteps();
  if (part.id === "existingData") return <ExampleRecordsToggle part={part} />;
  if (part.format === "singleChoice" && !part.optionSource) return <ChoiceRows numbered={numbered} part={part} />;
  if (part.format === "multipleChoice") return <CheckRows part={part} />;
  const answered = store.answers[part.id]?.value;
  return (
    <SetupQuestionField
      hideLabel
      currency={store.currency}
      descriptor={partDescriptor(part, t, store.answers)}
      disabled={store.isBusy}
      invalid={store.answerMissing(part.id)}
      value={
        !answered && part.format === "orderedList" && steps.length
          ? { format: "orderedList", items: steps.map((label) => ({ label })) }
          : displayedAnswerValue(part, store.answers)
      }
      onChange={(value) => store.setAnswer(part.id, value)}
    />
  );
});

function advancesOnPick(parts: SetupQuestionPart[]): boolean {
  return parts.length === 1 && parts[0].format === "singleChoice" && !parts[0].optionSource;
}

export const SetupQuestions = observer(function SetupQuestions() {
  const { workspaceSetupStore: store } = useRootStore();
  const advance = useContinue();
  const parts = store.currentQuestion.parts.filter((part) => partVisible(part, store.answers));
  const numbered = advancesOnPick(parts);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || isTyping(event.target) || event.defaultPrevented || store.isBusy) return;
      if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement) return;
      event.preventDefault();
      advance();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <section
      key={store.currentQuestion.id}
      aria-busy={store.isBusy}
      className="flex animate-page-result-in flex-col gap-4 motion-reduce:animate-none"
      id={`setup-question-${store.currentQuestion.id}`}
    >
      {parts.map((part) => (
        <QuestionPart key={part.id} numbered={numbered} part={part} />
      ))}
    </section>
  );
});

const StartEmptyAction = observer(function StartEmptyAction() {
  const t = useTranslations();
  const { workspaceSetupStore: store, onboardingWizardStore: wizard } = useRootStore();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Button
        className="min-h-11 text-muted-foreground"
        disabled={store.isBusy || wizard.isBusy}
        id="setup-start-empty"
        type="button"
        variant="ghost"
        onClick={() => setConfirming(true)}
      >
        {t("WorkspaceSetup.empty.action")}
      </Button>

      <ConfirmDialog
        anchorScope="setup-start-empty-confirm"
        confirmLabel={t("WorkspaceSetup.empty.confirm")}
        confirmVariant="default"
        description={t("WorkspaceSetup.empty.description")}
        open={confirming}
        title={t("WorkspaceSetup.empty.title")}
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          setConfirming(false);
          await wizard.startEmptyWorkspace();
        }}
      />
    </>
  );
});

export const SetupQuestionsFooter = observer(function SetupQuestionsFooter() {
  const t = useTranslations();
  const { workspaceSetupStore: store, onboardingWizardStore: wizard } = useRootStore();
  const advance = useContinue();
  const parts = store.currentQuestion.parts.filter((part) => partVisible(part, store.answers));
  const waitsForPick = advancesOnPick(parts) && !store.answers[parts[0].id];
  const firstQuestion = store.questionNumber <= 1;
  const canGoBack = !firstQuestion || store.adjusting || !wizard.isFirstStep;
  const back = () => {
    if (!firstQuestion) store.previousQuestion();
    else if (store.adjusting) store.discardAdjustment();
    else runUserAction(wizard.back);
  };

  return (
    <AppCardFooter className={WIZARD_FOOTER_CLASS}>
      {canGoBack ? (
        <Button
          className="min-h-11"
          disabled={store.isBusy || wizard.isBusy}
          id="setup-question-back"
          type="button"
          variant="ghost"
          onClick={back}
        >
          {t("Common.actions.back")}
        </Button>
      ) : (
        <StartEmptyAction />
      )}

      <div className={cn(WIZARD_FOOTER_GROUP_CLASS, "justify-end")}>
        {waitsForPick ? (
          <p className="text-xs text-muted-foreground" id="setup-question-pick-hint">
            {t("WorkspaceSetup.interview.pickOne")}
          </p>
        ) : (
          <Button
            className="min-h-11"
            disabled={store.isBusy}
            id="setup-question-continue"
            type="button"
            onClick={advance}
          >
            {store.pending === "save" ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}

            {store.isLastQuestion ? t("WorkspaceSetup.interview.showPlan") : t("OnboardingWizard.continue")}

            {store.pending === "save" ? null : <ArrowRight aria-hidden="true" className="size-4" />}
          </Button>
        )}
      </div>
    </AppCardFooter>
  );
});
