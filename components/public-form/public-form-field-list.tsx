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
};

export function PublicFormFieldList({ fields, options, onChange }: Props) {
  const t = useTranslations();
  const byId = new Map(options.map((option) => [option.fieldId, option]));

  const update = (index: number, patch: Partial<DraftField>) =>
    onChange(fields.map((field, at) => (at === index ? { ...field, ...patch } : field)));

  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <ul className="flex flex-col gap-2" id="public-form-fields">
      {fields.map((field, index) => {
        const option = byId.get(field.fieldId);
        const locked = option?.required === true;
        const id = `public-form-builder-field-${field.fieldId}`;
        return (
          <li key={field.fieldId} className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <Checkbox
                aria-label={t("PublicForm.builder.include", { field: option?.label ?? field.label })}
                checked={field.included}
                id={`${id}-include`}
                onCheckedChange={(checked) => update(index, { included: checked === true })}
              />

              <span className="min-w-0 flex-1 truncate text-sm font-medium">{option?.label ?? field.label}</span>

              <IconButton
                disabled={index === 0}
                icon={ArrowUp}
                label={t("PublicForm.builder.moveUp")}
                onClick={() => move(index, -1)}
              />

              <IconButton
                disabled={index === fields.length - 1}
                icon={ArrowDown}
                label={t("PublicForm.builder.moveDown")}
                onClick={() => move(index, 1)}
              />
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

                <div className="flex items-center gap-2 sm:col-span-2">
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
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
