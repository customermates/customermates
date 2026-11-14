"use client";

import type { IncomingWebhookResult } from "@/features/incoming-webhook/incoming-webhook.schema";
import type { MappingRow } from "./incoming-webhook-draft";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { PublicFormSelect } from "@/components/public-form/public-form-select";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  rows: MappingRow[];
  fields: NonNullable<IncomingWebhookResult["fields"]>;
  onChange: (rows: MappingRow[]) => void;
};

export function IncomingWebhookMappingRows({ rows, fields, onChange }: Props) {
  const t = useTranslations();
  const update = (index: number, patch: Partial<MappingRow>) =>
    onChange(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));

  return (
    <div className="flex flex-col gap-2" id="incoming-webhook-rows">
      {rows.map((row, index) => (
        <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={`incoming-webhook-path-${index}`}>{t("IncomingWebhooks.path")}</Label>

            <Input
              id={`incoming-webhook-path-${index}`}
              maxLength={200}
              value={row.path}
              onChange={(event) => update(index, { path: event.target.value })}
            />
          </div>

          <PublicFormSelect
            id={`incoming-webhook-field-${index}`}
            items={fields.map((field) => ({ value: field.fieldId, label: field.label }))}
            label={t("IncomingWebhooks.field")}
            value={row.fieldId}
            onValueChange={(value) => update(index, { fieldId: value })}
          />

          <IconButton
            disabled={rows.length === 1}
            icon={X}
            label={t("IncomingWebhooks.removeRow")}
            onClick={() => onChange(rows.filter((_, at) => at !== index))}
          />
        </div>
      ))}

      <div>
        <Button
          id="incoming-webhook-add-row"
          size="sm"
          variant="secondary"
          onClick={() => onChange([...rows, { path: "", fieldId: "" }])}
        >
          <Plus />

          {t("IncomingWebhooks.addRow")}
        </Button>
      </div>
    </div>
  );
}
