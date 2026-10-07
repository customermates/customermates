"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";

import type { RecordModel } from "@/features/records/record-model.schema";
import type { RecordPathStep } from "@/features/records/record-relationship-path.schema";

import { Button } from "@/components/ui/button";
import { RecordTypeGlyph } from "@/components/records/record-type-glyph";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { resolveRecordPath } from "@/features/records/record-relationship-path";

export function RelationshipPathInput({
  model,
  typeId,
  value,
  onChange,
  disabled = false,
}: {
  model: RecordModel;
  typeId: string;
  value: RecordPathStep[];
  onChange: (value: RecordPathStep[]) => void;
  disabled?: boolean;
}) {
  const t = useTranslations();
  const resolved = resolveRecordPath(typeId, value, model);
  const currentTypeId = resolved?.at(-1)?.typeId ?? typeId;
  const iconOf = (listId: string) => model.types.find((type) => type.id === listId)?.icon;
  const options = model.relationships
    .filter((relation) => !relation.archived)
    .flatMap((relation) =>
      (["outgoing", "incoming"] as const).flatMap((direction) =>
        (direction === "outgoing" ? relation.sourceTypeId : relation.targetTypeId) === currentTypeId
          ? [
              {
                value: `${relation.id}:${direction}`,
                label: direction === "outgoing" ? relation.sourceLabel : relation.targetLabel,
                icon: iconOf(direction === "outgoing" ? relation.targetTypeId : relation.sourceTypeId),
              },
            ]
          : [],
      ),
    );
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((step, index) => {
          const relation = model.relationships.find((relation) => relation.id === step.relationId);
          const label = relation
            ? step.direction === "outgoing"
              ? relation.sourceLabel
              : relation.targetLabel
            : t("RecordModel.relationship");
          return (
            <Button
              key={`${step.relationId}:${step.direction}:${index}`}
              aria-label={t("RecordModel.removePathStep", { label })}
              disabled={disabled}
              size="sm"
              type="button"
              variant="secondary"
              onClick={() => onChange(value.slice(0, index))}
            >
              {relation && (
                <RecordTypeGlyph
                  icon={iconOf(step.direction === "outgoing" ? relation.targetTypeId : relation.sourceTypeId)}
                />
              )}

              {label}

              <X className="size-3" />
            </Button>
          );
        })}
      </div>

      <Select
        disabled={disabled || value.length >= 6 || !options.length}
        value=""
        onValueChange={(key) => {
          const [relationId, direction] = key.split(":");
          if (direction === "incoming" || direction === "outgoing") onChange([...value, { relationId, direction }]);
        }}
      >
        <SelectTrigger aria-label={t("RecordModel.addPathStep")}>
          <SelectValue placeholder={t("RecordModel.addPathStep")} />
        </SelectTrigger>

        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} textValue={option.label} value={option.value}>
              <span className="flex items-center gap-2">
                <RecordTypeGlyph icon={option.icon} />

                {option.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
