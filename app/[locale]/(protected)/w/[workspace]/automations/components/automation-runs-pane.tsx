"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import type { AutomationRuleRunDto } from "@/features/automation-rules/automation-rule.schema";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { actionDataOrNull } from "@/core/utils/action-data";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { IntlLink } from "@/i18n/navigation";

import { getAutomationRuleRunsAction } from "../actions";
import { effectDetailText, runErrorText, runReasonText } from "./automation-run-texts";
import { AUTOMATION_STATUS_VARIANT } from "./automation-status-variant";

export function AutomationRunsPane({ ruleId, name }: { ruleId: string | undefined; name: string }) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const [runs, setRuns] = useState<AutomationRuleRunDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    (cursor: string | null, active: () => boolean) => {
      if (!ruleId) return;
      setLoading(true);
      void actionDataOrNull(getAutomationRuleRunsAction({ id: ruleId, ...(cursor ? { cursor } : {}) }))
        .then((page) => {
          if (!active()) return;
          setRuns((current) => (cursor ? [...current, ...(page?.runs ?? [])] : (page?.runs ?? [])));
          setNextCursor(page?.nextCursor ?? null);
          setLoading(false);
        })
        .catch((error: unknown) => {
          reportApplicationError(error);
          if (active()) setLoading(false);
        });
    },
    [ruleId],
  );

  useEffect(() => {
    let current = true;
    setRuns([]);
    setNextCursor(null);
    load(null, () => current);
    return () => {
      current = false;
    };
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

      {!loading && runs.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("AutomationRules.history.empty")}</p>
      )}

      <ul className="flex flex-col gap-3">
        {runs.map((run) => (
          <li key={run.id} className="flex flex-col gap-1.5 rounded-md border border-border p-3">
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

              return (
                <p key={index} className="text-xs text-muted-foreground" data-automation-run-effect={effect.status}>
                  {`${kind}: ${outcome}${detail}`}
                </p>
              );
            })}

            {run.error && run.effects.length === 0 && (
              <p className="text-xs text-destructive" data-automation-run-error="">
                {runErrorText(t, run.error)}
              </p>
            )}
          </li>
        ))}
      </ul>

      {loading && <Spinner aria-label={t("PageState.loading")} />}

      {!loading && nextCursor && (
        <div>
          <Button size="sm" variant="secondary" onClick={() => load(nextCursor, () => true)}>
            {t("Common.actions.loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
