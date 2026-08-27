import type { LucideIcon } from "lucide-react";

import { Calendar, CalendarRange, Clock, DollarSign, FileText, Globe, List, Mail, Phone } from "lucide-react";
import { CustomColumnType } from "@/generated/prisma";

export const CUSTOM_COLUMN_TYPE_ICON: Record<CustomColumnType, LucideIcon> = {
  [CustomColumnType.plain]: FileText,
  [CustomColumnType.date]: Calendar,
  [CustomColumnType.dateTime]: Clock,
  [CustomColumnType.dateRange]: CalendarRange,
  [CustomColumnType.dateTimeRange]: CalendarRange,
  [CustomColumnType.currency]: DollarSign,
  [CustomColumnType.link]: Globe,
  [CustomColumnType.email]: Mail,
  [CustomColumnType.phone]: Phone,
  [CustomColumnType.singleSelect]: List,
};

export const CUSTOM_COLUMN_TYPE_ITEMS = [
  CustomColumnType.plain,
  CustomColumnType.date,
  CustomColumnType.dateTime,
  CustomColumnType.dateRange,
  CustomColumnType.dateTimeRange,
  CustomColumnType.currency,
  CustomColumnType.link,
  CustomColumnType.email,
  CustomColumnType.phone,
  CustomColumnType.singleSelect,
].map((value) => ({ value, icon: CUSTOM_COLUMN_TYPE_ICON[value] }));
