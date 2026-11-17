"use client";

import { useTranslations } from "next-intl";

import type { AgentRuntimeAvailability } from "@/features/automation-rules/agent-runtime-availability";
import type { AgentRuntimeKind } from "@/features/automation-rules/automation-rule.schema";
import type { DraftAgent } from "./automation-draft";

import { ownKeyModelRequired } from "./automation-draft";

import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/core/utils/cn";
import { AGENT_RUNTIMES, AUTOMATION_AGENT_PROMPT_MAX_CHARS } from "@/features/automation-rules/automation-rule.schema";
import { RECORD_NAME_TOKEN } from "@/features/automation-rules/automation-template";
import { IntlLink } from "@/i18n/navigation";

import { Choose, Labeled } from "./automation-builder-fields";

export const AGENT_SETTINGS_HREF = "/settings/connections?tab=agents";

const DEFAULT_CHOICE = "default";
const NEXT_KEYS = ["ArrowRight", "ArrowDown"];
const PREVIOUS_KEYS = ["ArrowLeft", "ArrowUp"];

type Props = {
  effect: DraftAgent;
  runtimes: AgentRuntimeAvailability;
  flagged: boolean;
  ownRule?: boolean;
  onChange: (effect: DraftAgent) => void;
};

function RuntimeReason({ runtime, runtimes }: { runtime: AgentRuntimeKind; runtimes: AgentRuntimeAvailability }) {
  const t = useTranslations();
  const option = runtimes[runtime];
  if (option.available) return null;
  const reason = option.reason ?? "notConfigured";
  return (
    <p className="flex flex-wrap gap-x-1 text-xs text-warning-soft-foreground" data-agent-reason={reason} role="status">
      <span>{t(`Automations.agent.reason.${reason}`)}</span>

      <IntlLink className="underline" href={AGENT_SETTINGS_HREF}>
        {t("Automations.agent.openSettings")}
      </IntlLink>
    </p>
  );
}

export function AutomationAgentFields({ effect, runtimes, flagged, ownRule = true, onChange }: Props) {
  const t = useTranslations();
  const option = runtimes[effect.runtime];
  const ownerRunner = effect.runtime === "runner" && !ownRule;
  const modelRequired = ownKeyModelRequired(runtimes);
  const choose = (runtime: AgentRuntimeKind) => onChange({ ...effect, runtime, model: "", runnerId: "" });

  return (
    <div className="flex flex-col gap-3">
      <div aria-label={t("Automations.agent.runtimeLabel")} className="flex flex-wrap gap-2" role="radiogroup">
        {AGENT_RUNTIMES.map((runtime, index) => {
          const selected = effect.runtime === runtime;
          return (
            <button
              key={runtime}
              aria-checked={selected}
              className={cn(
                "flex min-w-32 flex-1 flex-col gap-0.5 rounded-md border px-3 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                selected ? "border-ring bg-accent" : "border-border hover:bg-accent/50",
                !runtimes[runtime].available && "text-muted-foreground",
              )}
              data-agent-runtime={runtime}
              role="radio"
              tabIndex={selected ? 0 : -1}
              type="button"
              onClick={() => choose(runtime)}
              onKeyDown={(event) => {
                const step = NEXT_KEYS.includes(event.key) ? 1 : PREVIOUS_KEYS.includes(event.key) ? -1 : 0;
                if (step === 0) return;
                event.preventDefault();
                const next = AGENT_RUNTIMES[(index + step + AGENT_RUNTIMES.length) % AGENT_RUNTIMES.length];
                if (!next) return;
                choose(next);
                event.currentTarget.parentElement
                  ?.querySelector<HTMLElement>(`[data-agent-runtime="${next}"]`)
                  ?.focus();
              }}
            >
              <span className="font-medium">{t(`Automations.agent.runtime.${runtime}`)}</span>

              <span className="text-xs text-muted-foreground">
                {runtimes[runtime].available
                  ? t(`Automations.agent.runtimeHint.${runtime}`)
                  : t("Automations.agent.unavailable")}
              </span>
            </button>
          );
        })}
      </div>

      {ownerRunner ? (
        <p className="text-xs text-muted-foreground" data-agent-owner-runner="">
          {t("Automations.agent.ownerRunner")}
        </p>
      ) : (
        <RuntimeReason runtime={effect.runtime} runtimes={runtimes} />
      )}

      {effect.runtime === "ownKey" && (option.models.length > 0 || effect.model !== "") && (
        <Labeled label={t("Automations.agent.model")}>
          <Choose
            items={[
              ...(modelRequired ? [] : [{ id: DEFAULT_CHOICE, label: t("Automations.agent.defaultModel") }]),
              ...option.models,
            ]}
            label={t("Automations.agent.model")}
            placeholder={t("AutomationRules.builder.choose")}
            value={effect.model || (modelRequired ? "" : DEFAULT_CHOICE)}
            onChange={(model) => onChange({ ...effect, model: model === DEFAULT_CHOICE ? "" : model })}
          />
        </Labeled>
      )}

      {effect.runtime === "runner" && !ownerRunner && (option.runners.length > 0 || effect.runnerId !== "") && (
        <Labeled label={t("Automations.agent.runner")}>
          <Choose
            items={[
              { id: DEFAULT_CHOICE, label: t("Automations.agent.anyRunner") },
              ...option.runners.map((runner) => ({
                id: runner.id,
                label: runner.online ? runner.name : t("Automations.agent.runnerOffline", { name: runner.name }),
              })),
            ]}
            label={t("Automations.agent.runner")}
            placeholder={t("AutomationRules.builder.choose")}
            value={effect.runnerId || DEFAULT_CHOICE}
            onChange={(runnerId) => onChange({ ...effect, runnerId: runnerId === DEFAULT_CHOICE ? "" : runnerId })}
          />
        </Labeled>
      )}

      <Labeled label={t("Automations.agent.prompt")}>
        <Textarea
          aria-invalid={flagged || undefined}
          maxLength={AUTOMATION_AGENT_PROMPT_MAX_CHARS}
          placeholder={t("Automations.agent.promptPlaceholder")}
          rows={4}
          value={effect.prompt}
          onChange={(event) => onChange({ ...effect, prompt: event.target.value })}
        />
      </Labeled>

      <p className="text-xs text-muted-foreground">
        {t("AutomationRules.builder.placeholders", { recordName: RECORD_NAME_TOKEN, ruleName: "{{rule.name}}" })}
      </p>
    </div>
  );
}
