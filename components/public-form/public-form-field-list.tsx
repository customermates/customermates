"use client";

import type { FormFieldOption } from "@/features/public-form/public-form.schema";
import type { DraftField } from "./public-form-draft";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useTranslations } from "next-intl";

import { Checkbox } from "@/components/ui/checkbox";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  fields: DraftField[];
  options: readonly FormFieldOption[];
  onChange: (fields: DraftField[]) => void;
  onMove: (index: number, offset: -1 | 1) => void;
};

export function PublicFormFieldList({ fields, options, onChange, onMove }: Props) {
  const t = useTranslations();
  const byId = new Map(options.map((option) => [option.fieldId, option]));

  const update = (index: number, patch: Partial<DraftField>) =>
    onChange(fields.map((field, at) => (at === index ? { ...field, ...patch } : field)));

  return (
    <ul className="flex flex-col gap-2" id="public-form-fields">
      {fields.map((field, index) => {
        const option = byId.get(field.fieldId);
        const locked = option?.required === true;
        const mustInclude = option?.mustInclude === true;
        const id = `public-form-builder-field-${field.fieldId}`;
        return (
          <li key={field.fieldId} className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Checkbox
                aria-label={t("PublicForm.builder.include", { field: option?.label ?? field.label })}
                checked={field.included || mustInclude}
                disabled={mustInclude}
                id={`${id}-include`}
                onCheckedChange={(checked) => update(index, { included: checked === true || mustInclude })}
              />

              <span className="min-w-0 flex-1 truncate text-sm font-medium">{option?.label ?? field.label}</span>

              {field.included ? (
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={field.required || locked}
                    disabled={locked}
                    id={`${id}-required`}
                    onCheckedChange={(checked) => update(index, { required: checked === true })}
                  />

                  <Label className="font-normal" htmlFor={`${id}-required`}>
                    {locked ? t("PublicForm.builder.requiredByList") : t("PublicForm.builder.required")}
                  </Label>
                </div>
              ) : null}

              <div className="flex items-center">
                <IconButton
                  disabled={index === 0}
                  icon={ArrowUp}
                  label={t("PublicForm.builder.moveUp")}
                  onClick={() => onMove(index, -1)}
                />

                <IconButton
                  disabled={index === fields.length - 1}
                  icon={ArrowDown}
                  label={t("PublicForm.builder.moveDown")}
                  onClick={() => onMove(index, 1)}
                />
              </div>
            </div>

            {field.included ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${id}-label`}>{t("PublicForm.builder.questionLabel")}</Label>

                  <Input
                    id={`${id}-label`}
                    maxLength={120}
                    value={field.label}
                    onChange={(event) => update(index, { label: event.target.value })}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${id}-help`}>{t("PublicForm.builder.helpText")}</Label>

                  <Input
                    id={`${id}-help`}
                    maxLength={300}
                    value={field.helpText}
                    onChange={(event) => update(index, { helpText: event.target.value })}
                  />
                </div>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
