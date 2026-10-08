import { recordTypeIcon } from "@/components/records/record-type-icon";

export function RecordChipIcon({ icons, typeId }: { icons: Partial<Record<string, string>>; typeId: string }) {
  const Icon = recordTypeIcon(icons[typeId] ?? "");
  return <Icon aria-hidden className="size-3 shrink-0" />;
}
