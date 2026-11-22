"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import type { AutomationRuleRunDto } from "@/features/automation-rules/automation-rule.schema";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";
import { actionDataOrNull } from "@/core/utils/action-data";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { IntlLink } from "@/i18n/navigation";

import { getAutomationRuleRunsAction } from "../actions";
import { agentJobIdOf, AutomationRunAgentStep } from "./automation-run-agent-step";
import { effectDetailText, runErrorText, runReasonText } from "./automation-run-texts";
import { AUTOMATION_STATUS_VARIANT } from "./automation-status-variant";

type Props = {
  ruleId: string | undefined;
  name: string;
  activeRunId?: string | null;
  onShowRun?: (run: AutomationRuleRunDto) => void;
};

export function AutomationRunsPane({ ruleId, name, activeRunId, onShowRun }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const [runs, setRuns] = useState<AutomationRuleRunDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<{ cursor: string | null } | null>(null);

  const generation = useRef(0);

  const load = useCallback(
    (cursor: string | null) => {
      if (!ruleId) return;
      const started = generation.current;
      const active = () => generation.current === started;
      setLoading(true);
      setFailed(null);
      void actionDataOrNull(getAutomationRuleRunsAction({ id: ruleId, ...(cursor ? { cursor } : {}) }))
        .then((page) => {
          if (!active()) return;
          setLoading(false);
          if (!page) {
            setFailed({ cursor });
            return;
          }
          setRuns((current) => (cursor ? [...current, ...page.runs] : page.runs));
          setNextCursor(page.nextCursor);
        })
        .catch((error: unknown) => {
          reportApplicationError(error);
          if (!active()) return;
          setLoading(false);
          setFailed({ cursor });
        });
    },
    [ruleId],
  );

  useEffect(() => {
    generation.current += 1;
    setRuns([]);
    setNextCursor(null);
    setLoading(false);
    setFailed(null);
    load(null);
  }, [load]);

  if (!ruleId) return <p className="text-sm text-muted-foreground">{t("Automations.runs.unsaved")}</p>;

  return (
    <div
      aria-label={t("AutomationRules.history.open")}
      className="flex flex-col gap-3"
      data-automation-runs=""
      role="region"
    >
      <h3 className="text-sm font-semibold">{t("AutomationRules.history.title", { name: name.trim() })}</h3>

      {!loading && !failed && runs.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("AutomationRules.history.empty")}</p>
      )}

      <ul className="flex flex-col gap-3">
        {runs.map((run) => (
          <li
            key={run.id}
            className={cn(
              "flex flex-col gap-1.5 rounded-md border border-border p-3",
              activeRunId === run.id && "border-ring/60",
            )}
            data-automation-run={run.id}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge variant={AUTOMATION_STATUS_VARIANT[run.status]}>{t(`AutomationRules.status.${run.status}`)}</Badge>

              <span className="text-xs text-muted-foreground">
                {intlStore.formatRelativeTime(new Date(run.createdAt))}
              </span>
            </div>

            {run.typeId && run.recordId && (
              <IntlLink className="text-sm underline" href={`/records/${run.typeId}/${run.recordId}`}>
                {t("AutomationRules.history.record")}
              </IntlLink>
            )}

            {run.reason && (
              <p className="text-xs text-muted-foreground" data-automation-run-reason="">
                {runReasonText(t, run.reason)}
              </p>
            )}

            {run.effects.map((effect, index) => {
              const kind = t(`AutomationRules.effect.${effect.kind}`);
              const outcome = t(`AutomationRules.outcome.${effect.status}`);
              const detail =
                effect.detail && effect.status !== "applied" ? ` · ${effectDetailText(t, effect.detail)}` : "";
              const agentJobId = agentJobIdOf(effect);

              return (
                <div key={index} className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground" data-automation-run-effect={effect.status}>
                    {`${kind}: ${outcome}${detail}`}
                  </p>

                  {agentJobId && <AutomationRunAgentStep key={agentJobId} jobId={agentJobId} />}
                </div>
              );
            })}

            {run.error && run.effects.length === 0 && (
              <p className="text-xs text-destructive" data-automation-run-error="">
                {runErrorText(t, run.error)}
              </p>
            )}

            {onShowRun && (
              <div>
                <Button
                  aria-pressed={activeRunId === run.id}
                  data-automation-run-show={run.id}
                  size="xs"
                  type="button"
                  variant="secondary"
                  onClick={() => onShowRun(run)}
                >
                  {t("Automations.canvas.replay.show")}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {loading && <Spinner aria-label={t("PageState.loading")} />}

      {!loading && failed && (
        <div className="flex flex-col items-start gap-2" data-automation-runs-error="" role="alert">
          <p className="text-sm text-destructive">{t("AutomationRules.history.loadFailed")}</p>

          <Button size="sm" variant="secondary" onClick={() => load(failed.cursor)}>
            {t("ErrorCard.retry")}
          </Button>
        </div>
      )}

      {!loading && !failed && nextCursor && (
        <div>
          <Button size="sm" variant="secondary" onClick={() => load(nextCursor)}>
            {t("Common.actions.loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
