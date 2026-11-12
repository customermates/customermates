"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import type { AutomationRuleDto, AutomationRuleRunDto } from "@/features/automation-rules/automation-rule.schema";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppModal } from "@/components/modal/app-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { actionDataOrNull } from "@/core/utils/action-data";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { IntlLink } from "@/i18n/navigation";

import { getAutomationRuleRunsAction } from "../actions";

type Props = { rule: AutomationRuleDto | null; onClose: () => void };

const PAGE_SIZE = 25;
const STATUS_VARIANT = {
  queued: "secondary",
  running: "info",
  applied: "success",
  skipped: "warning",
  failed: "destructive",
} as const;

export function AutomationRunHistory({ rule, onClose }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const [runs, setRuns] = useState<AutomationRuleRunDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const ruleId = rule?.id ?? null;

  useEffect(() => {
    if (!ruleId) return;
    let active = true;
    setLoading(true);
    void actionDataOrNull(getAutomationRuleRunsAction({ id: ruleId, page: 1, pageSize: PAGE_SIZE })).then((page) => {
      if (!active) return;
      setRuns(page?.items ?? []);
      setTotal(page?.total ?? 0);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [ruleId]);

  const more = () => {
    if (!ruleId) return;
    setLoading(true);
    void actionDataOrNull(
      getAutomationRuleRunsAction({ id: ruleId, page: Math.floor(runs.length / PAGE_SIZE) + 1, pageSize: PAGE_SIZE }),
    ).then((page) => {
      setRuns((current) => [...current, ...(page?.items ?? [])]);
      setLoading(false);
    });
  };

  return (
    <AppModal
      open={rule !== null}
      size="xl"
      title={t("AutomationRules.history.title", { name: rule?.name ?? "" })}
      onClose={onClose}
    >
      <AppCard>
        <AppCardBody>
          {!loading && runs.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("AutomationRules.history.empty")}</p>
          )}

          <ul className="flex flex-col gap-3">
            {runs.map((run) => (
              <li key={run.id} className="flex flex-col gap-1.5 rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant={STATUS_VARIANT[run.status]}>{t(`AutomationRules.status.${run.status}`)}</Badge>

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
                  <p className="text-xs text-muted-foreground">{t(`AutomationRules.reason.${run.reason}`)}</p>
                )}

                {run.effects.map((effect, index) => {
                  const kind = t(`AutomationRules.effect.${effect.kind}`);
                  const outcome = t(`AutomationRules.outcome.${effect.status}`);
                  const detail = effect.detail && effect.status !== "applied" ? ` (${effect.detail})` : "";

                  return (
                    <p key={index} className="text-xs text-muted-foreground">
                      {`${kind}: ${outcome}${detail}`}
                    </p>
                  );
                })}

                {run.error && run.effects.length === 0 && <p className="text-xs text-destructive">{run.error}</p>}
              </li>
            ))}
          </ul>

          {loading && <Spinner aria-label={t("PageState.loading")} />}

          {!loading && runs.length < total && (
            <div>
              <Button size="sm" variant="secondary" onClick={more}>
                {t("Common.actions.loadMore")}
              </Button>
            </div>
          )}
        </AppCardBody>
      </AppCard>
    </AppModal>
  );
}
