import { recordTypeIcon } from "@/components/records/record-type-icon";
import { Avatar } from "@/components/ui/avatar";

export function RecordChipIcon({
  icons,
  typeId,
  pictureUrl,
}: {
  icons: Partial<Record<string, string>>;
  typeId: string;
  pictureUrl?: string | null;
}) {
  const Icon = recordTypeIcon(icons[typeId] ?? "");
  const icon = <Icon aria-hidden className="size-3 shrink-0" />;
  if (!pictureUrl) return icon;
  return <Avatar aria-hidden data-record-chip-picture="" fallback={icon} size="sm" src={pictureUrl} />;
}
