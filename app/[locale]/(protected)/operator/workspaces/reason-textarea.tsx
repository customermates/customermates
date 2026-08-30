"use client";

import { useTranslations } from "next-intl";

import { Textarea } from "@/components/ui/textarea";

import { FormField } from "../users/operator-users-ui";

export function ReasonTextarea({ disabled, id }: { disabled: boolean; id: string }) {
  const t = useTranslations();

  return (
    <FormField description={t("OperatorUsers.forms.reasonDescription")} id={id} label={t("OperatorUsers.forms.reason")}>
      <Textarea
        required
        aria-describedby={`${id}-description`}
        disabled={disabled}
        id={id}
        maxLength={500}
        minLength={8}
        name="reason"
        placeholder={t("OperatorUsers.forms.reasonPlaceholder")}
        rows={3}
      />
    </FormField>
  );
}
