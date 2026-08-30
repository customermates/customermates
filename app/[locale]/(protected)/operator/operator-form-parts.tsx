"use client";

import type { ReactNode } from "react";
import type { BaseFormStore } from "@/core/base/base-form.store";

import { useTranslations } from "next-intl";

import { FormActions } from "@/components/card/form-actions";
import { FormTextarea } from "@/components/forms/form-textarea";

export function OperatorReasonField() {
  const t = useTranslations();

  return (
    <div className="space-y-1.5">
      <FormTextarea
        required
        id="reason"
        label={t("OperatorConsole.forms.reason")}
        maxLength={500}
        minLength={8}
        placeholder={t("OperatorConsole.forms.reasonPlaceholder")}
        rows={3}
      />

      <p className="text-xs text-muted-foreground">{t("OperatorConsole.forms.reasonDescription")}</p>
    </div>
  );
}

export function OperatorFormActions({ store }: { store: BaseFormStore }) {
  return (
    <div className="flex justify-end pt-1">
      <FormActions showInitially store={store} variant="topbar" />
    </div>
  );
}

export function OperatorFormSection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="space-y-1">
        <h3 className="text-x-sm font-medium">{title}</h3>

        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>

      {children}
    </section>
  );
}
