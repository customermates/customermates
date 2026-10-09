import type { LucideIcon } from "lucide-react";
import type { RecordValueType } from "@/features/records/record-model.schema";

import {
  Banknote,
  Calendar,
  CalendarClock,
  CalendarRange,
  CircleCheck,
  CircleDot,
  FileText,
  Globe,
  Hash,
  Mail,
  Phone,
  Type,
  UserRound,
} from "lucide-react";

import { cn } from "@/core/utils/cn";

const VALUE_TYPE_ICONS: Record<RecordValueType, LucideIcon> = {
  text: Type,
  richText: FileText,
  number: Hash,
  currency: Banknote,
  boolean: CircleCheck,
  date: Calendar,
  dateTime: CalendarClock,
  dateRange: CalendarRange,
  dateTimeRange: CalendarRange,
  select: CircleDot,
  email: Mail,
  phone: Phone,
  url: Globe,
  member: UserRound,
};

export function recordValueTypeIcon(valueType: RecordValueType): LucideIcon {
  return VALUE_TYPE_ICONS[valueType];
}

export function RecordValueTypeIcon({ valueType, className }: { valueType: RecordValueType; className?: string }) {
  const Icon = recordValueTypeIcon(valueType);
  return <Icon aria-hidden className={cn("size-3 shrink-0 text-muted-foreground", className)} />;
}
