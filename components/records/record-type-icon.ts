import { Building2, CheckCircle2, Folder, List, Package, TrendingUp, Users, Briefcase } from "lucide-react";

const icons = {
  contact: Users,
  building: Building2,
  handshake: TrendingUp,
  package: Package,
  check: CheckCircle2,
  folder: Folder,
  briefcase: Briefcase,
  list: List,
};

export type RecordTypeIconKey = keyof typeof icons;

export const RECORD_TYPE_ICON_KEYS = Object.keys(icons) as RecordTypeIconKey[];

export function recordTypeIcon(icon: string) {
  return Object.hasOwn(icons, icon) ? icons[icon as RecordTypeIconKey] : Folder;
}
