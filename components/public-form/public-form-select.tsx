"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
  id: string;
  label: string;
  value: string;
  items: ReadonlyArray<{ value: string; label: string }>;
  disabled?: boolean;
  onValueChange: (value: string) => void;
};

export function PublicFormSelect({ id, label, value, items, disabled, onValueChange }: Props) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>

      <Select disabled={disabled} value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full" id={id} size="sm">
          <SelectValue />
        </SelectTrigger>

        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
