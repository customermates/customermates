"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type { AutomationRuleDto } from "@/features/automation-rules/automation-rule.schema";
import type { AutomationBuilderModel } from "./automation-builder-model";
import type { AutomationDraft } from "./automation-draft";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { FormFooterActions } from "@/components/forms/form-footer-actions";
import { AppModal } from "@/components/modal/app-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import { upsertAutomationRuleAction } from "../actions";
import { draftHasRecord, draftToUpsert } from "./automation-draft";
import { dismissAutomationError, showAutomationError, showAutomationSaveError } from "./automation-error-toast";
import { Labeled } from "./automation-builder-fields";
import { AutomationConditionsEditor } from "./automation-conditions-editor";
import { AutomationEffectsEditor } from "./automation-effects-editor";
import { AutomationTriggerEditor } from "./automation-trigger-editor";

type Props = {
  draft: AutomationDraft | null;
  model: AutomationBuilderModel;
  onClose: () => void;
  onSaved: (rule: AutomationRuleDto) => void;
};

export function AutomationBuilder({ draft: initial, model, onClose, onSaved }: Props) {
  const t = useTranslations();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<AutomationDraft | null>(initial);
  const [shown, setShown] = useState(initial);
  const [invalid, setInvalid] = useState<string[]>([]);
  if (initial !== shown) {
    setShown(initial);
    setDraft(initial);
    setInvalid([]);
  }

  const update = (patch: Partial<AutomationDraft>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current));
  const flagged = (key: string) => invalid.some((issue) => issue === key || issue.startsWith(`${key}.`));

  const save = () => {
    if (!draft) return;
    const converted = draftToUpsert(draft, model);
    if (!converted.ok) {
      setInvalid(converted.issues);
      showAutomationError(t("AutomationRules.builder.incomplete"));
      return;
    }
    setInvalid([]);
    dismissAutomationError();
    startTransition(async () => {
      const result = await upsertAutomationRuleAction(converted.input);
      if (!result.ok) {
        showAutomationSaveError(result.error);
        return;
      }
      toast.success(t("Common.notifications.updated"));
      onSaved(result.data);
    });
  };

  return (
    <AppModal
      open={draft !== null}
      size="3xl"
      title={draft?.id ? t("AutomationRules.builder.titleEdit") : t("AutomationRules.builder.titleNew")}
      onClose={onClose}
    >
      {draft && (
        <AppCard>
          <AppCardBody>
            <div className="flex flex-wrap items-end gap-4">
              <Labeled label={t("AutomationRules.builder.name")}>
                <Input
                  aria-invalid={flagged("name") || undefined}
                  placeholder={t("AutomationRules.builder.namePlaceholder")}
                  value={draft.name}
                  onChange={(event) => update({ name: event.target.value })}
                />
              </Labeled>

              <div className="flex items-center gap-2 pb-2">
                <Switch
                  checked={draft.enabled}
                  id="automation-active"
                  onCheckedChange={(enabled) => update({ enabled })}
                />

                <Label htmlFor="automation-active">{t("AutomationRules.builder.active")}</Label>
              </div>
            </div>

            <AutomationTriggerEditor
              flagged={flagged}
              model={model}
              trigger={draft.trigger}
              onChange={(patch) => update({ trigger: { ...draft.trigger, ...patch } })}
            />

            {draftHasRecord(draft.trigger) && (
              <AutomationConditionsEditor
                draft={draft}
                flagged={flagged}
                model={model}
                onChange={(conditions) => update({ conditions })}
              />
            )}

            <AutomationEffectsEditor
              draft={draft}
              flagged={flagged}
              model={model}
              onChange={(effects) => update({ effects })}
            />
          </AppCardBody>

          <FormFooterActions creating saving={pending} onCancel={onClose} onSave={save} />
        </AppCard>
      )}
    </AppModal>
  );
}
