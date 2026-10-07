import { recordTypeIcon } from "@/components/records/record-type-icon";

export function RecordChipIcon({ types, typeId }: { types: readonly { id: string; icon: string }[]; typeId: string }) {
  const Icon = recordTypeIcon(types.find((type) => type.id === typeId)?.icon ?? "");
  return <Icon aria-hidden className="size-3 shrink-0" />;
}
