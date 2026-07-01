"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardFooter } from "@/components/card/app-card-footer";

// Mirrors the write-input fields the API accepts (see agent-skill.schema.ts).
export type AgentSkillFormValue = {
  name: string;
  title: string;
  summary: string;
  instructions: string;
  enabled: boolean;
  sortOrder: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // null → create mode; a value → edit mode (prefilled).
  initialValue: AgentSkillFormValue | null;
  canManage: boolean;
  onSubmit: (value: AgentSkillFormValue) => Promise<boolean>;
};

// Keep in sync with agent-skill.schema.ts SkillFields.
const NAME_PATTERN = /^[a-z0-9_]+$/;
const LIMITS = { name: 64, title: 120, summary: 280, instructions: 8000 };

const EMPTY: AgentSkillFormValue = {
  name: "",
  title: "",
  summary: "",
  instructions: "",
  enabled: true,
  sortOrder: 0,
};

export function AgentSkillModal({ open, onOpenChange, initialValue, canManage, onSubmit }: Props) {
  const t = useTranslations("AgentSkills");
  const isEdit = Boolean(initialValue);

  const [value, setValue] = useState<AgentSkillFormValue>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset the form whenever the dialog is (re)opened for a new target.
  useEffect(() => {
    if (open) {
      setValue(initialValue ?? EMPTY);
      setError(null);
      setSubmitting(false);
    }
  }, [open, initialValue]);

  const patch = <K extends keyof AgentSkillFormValue>(key: K, next: AgentSkillFormValue[K]) =>
    setValue((prev) => ({ ...prev, [key]: next }));

  const validate = (): string | null => {
    if (!value.name.trim() || !value.title.trim() || !value.summary.trim() || !value.instructions.trim())
      return t("form.errors.required");

    if (!NAME_PATTERN.test(value.name)) return t("form.errors.namePattern");
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSubmitting(true);
    const ok = await onSubmit({
      ...value,
      name: value.name.trim(),
      title: value.title.trim(),
      summary: value.summary.trim(),
      instructions: value.instructions.trim(),
      sortOrder: Number.isFinite(value.sortOrder) ? value.sortOrder : 0,
    });
    setSubmitting(false);
    if (!ok) return;
  };

  const title = isEdit ? t("form.editTitle") : t("form.createTitle");
  const disabled = !canManage || submitting;

  return (
    <AppModal open={open} size="lg" title={title} onClose={() => onOpenChange(false)}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <AppCard>
          <AppCardHeader>
            <div className="space-y-1">
              <h2 className="text-x-lg">{title}</h2>

              <p className="text-subdued text-sm">{t("form.description")}</p>
            </div>
          </AppCardHeader>

          <AppCardBody>
            <div className="space-y-1.5">
              <Label htmlFor="agent-skill-name">{t("form.fields.name")}</Label>

              <Input
                autoComplete="off"
                disabled={disabled || isEdit}
                id="agent-skill-name"
                maxLength={LIMITS.name}
                placeholder={t("form.placeholders.name")}
                value={value.name}
                onChange={(event) => patch("name", event.target.value)}
              />

              <p className="text-subdued text-xs">{t("form.hints.name")}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="agent-skill-title">{t("form.fields.title")}</Label>

              <Input
                disabled={disabled}
                id="agent-skill-title"
                maxLength={LIMITS.title}
                placeholder={t("form.placeholders.title")}
                value={value.title}
                onChange={(event) => patch("title", event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="agent-skill-summary">{t("form.fields.summary")}</Label>

              <Textarea
                className="min-h-16"
                disabled={disabled}
                id="agent-skill-summary"
                maxLength={LIMITS.summary}
                placeholder={t("form.placeholders.summary")}
                value={value.summary}
                onChange={(event) => patch("summary", event.target.value)}
              />

              <p className="text-subdued text-xs">{t("form.hints.summary")}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="agent-skill-instructions">{t("form.fields.instructions")}</Label>

              <Textarea
                className="min-h-40"
                disabled={disabled}
                id="agent-skill-instructions"
                maxLength={LIMITS.instructions}
                placeholder={t("form.placeholders.instructions")}
                value={value.instructions}
                onChange={(event) => patch("instructions", event.target.value)}
              />

              <p className="text-subdued text-xs">{t("form.hints.instructions")}</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="agent-skill-sort-order">{t("form.fields.sortOrder")}</Label>

                <Input
                  disabled={disabled}
                  id="agent-skill-sort-order"
                  inputMode="numeric"
                  min={0}
                  type="number"
                  value={value.sortOrder}
                  onChange={(event) => patch("sortOrder", event.target.valueAsNumber || 0)}
                />

                <p className="text-subdued text-xs">{t("form.hints.sortOrder")}</p>
              </div>

              <div className="flex items-center justify-between rounded-md border border-border p-3">
                <Label className="cursor-pointer" htmlFor="agent-skill-enabled">
                  {t("form.fields.enabled")}
                </Label>

                <Switch
                  checked={value.enabled}
                  disabled={disabled}
                  id="agent-skill-enabled"
                  onCheckedChange={(checked) => patch("enabled", checked)}
                />
              </div>
            </div>

            {error ? <p className="text-destructive text-sm">{error}</p> : null}
          </AppCardBody>

          <AppCardFooter>
            <Button disabled={submitting} type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("form.cancel")}
            </Button>

            <Button disabled={disabled} type="submit">
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}

              {isEdit ? t("form.save") : t("form.create")}
            </Button>
          </AppCardFooter>
        </AppCard>
      </form>
    </AppModal>
  );
}
