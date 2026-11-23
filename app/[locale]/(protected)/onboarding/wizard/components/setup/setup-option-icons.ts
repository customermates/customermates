import {
  BriefcaseBusiness,
  Building2,
  Clock,
  FileSpreadsheet,
  Gift,
  Handshake,
  Hammer,
  House,
  Inbox,
  Landmark,
  LifeBuoy,
  Megaphone,
  MessageCircle,
  Package,
  Receipt,
  Repeat,
  ShoppingBag,
  Sparkles,
  SquareDashed,
  Tag,
  TrendingUp,
  UserRound,
  UserSearch,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

const OPTION_ICONS: Record<string, LucideIcon> = {
  "workWith.customers": ShoppingBag,
  "workWith.clients": BriefcaseBusiness,
  "workWith.ownWork": House,
  "purpose.deals": Inbox,
  "purpose.projects": Hammer,
  "purpose.contracts": Repeat,
  "purpose.orders": Receipt,
  "purpose.chats": MessageCircle,
  "purpose.support": LifeBuoy,
  "purpose.hiring": UserSearch,
  "purpose.investors": TrendingUp,
  "purpose.partners": Handshake,
  "purpose.finances": Landmark,
  "purpose.marketing": Megaphone,
  "pricing.fixedPrice": Tag,
  "pricing.timeBased": Clock,
  "pricing.subscription": Repeat,
  "pricing.products": Package,
  "pricing.free": Gift,
  "teamSize.solo": UserRound,
  "teamSize.small": UsersRound,
  "teamSize.large": Building2,
  "existingData.sampleData": Sparkles,
  "existingData.empty": SquareDashed,
  "existingData.spreadsheet": FileSpreadsheet,
};

export function setupOptionIcon(questionId: string, optionId: string): LucideIcon | null {
  return OPTION_ICONS[`${questionId}.${optionId}`] ?? null;
}

const SEGMENT_MAX_OPTIONS = 3;
const SEGMENT_MAX_LABEL = 32;

export function showsAsSegments(options: ReadonlyArray<{ label: string }>): boolean {
  return (
    options.length >= 2 &&
    options.length <= SEGMENT_MAX_OPTIONS &&
    options.every((option) => option.label.length <= SEGMENT_MAX_LABEL)
  );
}
