"use client";

import { useTranslations } from "next-intl";

import { SelectableCard } from "@/components/forms/selectable-card";
import { RadioGroup } from "@/components/ui/radio-group";
import { SignatureTemplate } from "@/ee/messaging/email-settings";
import { cn } from "@/core/utils/cn";

function Bars({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="h-1.5 w-4/5 rounded-full bg-muted-foreground" />

      <span className="h-1 w-3/5 rounded-full bg-border-strong" />

      <span className="h-1 w-2/3 rounded-full bg-border-strong" />
    </div>
  );
}

function Mark({ className }: { className?: string }) {
  return <span className={cn("bg-muted-foreground/25 block shrink-0 rounded-sm", className)} />;
}

function TemplateIllustration({ template }: { template: SignatureTemplate }) {
  if (template === SignatureTemplate.sideBySide) {
    return (
      <div className="flex h-12 w-full items-center gap-2">
        <Mark className="size-8" />

        <Bars className="min-w-0 flex-1" />
      </div>
    );
  }

  if (template === SignatureTemplate.stacked) {
    return (
      <div className="flex h-12 w-full flex-col gap-1.5">
        <Mark className="size-5" />

        <Bars className="w-full" />
      </div>
    );
  }

  return (
    <div className="flex h-12 w-full items-center">
      <Bars className="w-full" />
    </div>
  );
}

type Props = {
  disabled?: boolean;
  value: SignatureTemplate;
  onValueChange: (value: SignatureTemplate) => void;
};

export function SignatureTemplatePicker({ disabled, value, onValueChange }: Props) {
  const t = useTranslations();

  return (
    <fieldset className="min-w-0">
      <legend className="text-muted-foreground mb-1.5 text-xs leading-none font-normal">
        {t("ConnectedAccountsCard.signatureTemplate")}
      </legend>

      <RadioGroup
        className="grid grid-cols-3 gap-2"
        disabled={disabled}
        value={value}
        onValueChange={(next) => onValueChange(next as SignatureTemplate)}
      >
        {Object.values(SignatureTemplate).map((template) => (
          <SelectableCard
            key={template}
            disabled={disabled}
            id={`signature-template-${template}`}
            label={t(`ConnectedAccountsCard.signatureTemplates.${template}`)}
            labelClassName="min-h-24 gap-2"
            selectionMode="single"
            value={template}
            visual={<TemplateIllustration template={template} />}
          />
        ))}
      </RadioGroup>
    </fieldset>
  );
}
