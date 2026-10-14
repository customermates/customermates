import { presetId } from "@/features/records/crm-preset";
import { SIDEBAR_P13N_ID, SidebarLayoutSchema, type SidebarLayout } from "@/features/p13n/sidebar-layout.schema";

import type { SeedContext } from "./context";
import { fixtureId } from "./helpers";
import {
  NORTHWIND_MEMBER_IDS,
  NORTHWIND_MEMBER_ROLES,
  NORTHWIND_ROLE_IDS,
  type NorthwindTypeKey,
} from "./northwind-model";
import { SYNTHETIC_ROLE_DEFINITIONS } from "./roles";

export const SYNTHETIC_SIDEBAR_P13N_ID_PREFIX = "4e000000";

type MemberKey = keyof typeof NORTHWIND_MEMBER_IDS;
type ListKey = Exclude<NorthwindTypeKey, "lineItem">;
type Section = { id: string; name?: string; items: Array<{ list: ListKey } | { item: string }> };

/** The team sections of the Northwind sidebar, in the admin's order. Configure and Trash stay where the app puts them. */
const SECTIONS: Record<
  "overview" | "sales" | "customerSuccess" | "support" | "marketing" | "hiring" | "work",
  Section
> = {
  overview: {
    id: "overview",
    items: [{ item: "dashboard" }, { item: "wiki" }, { item: "inbox" }, { item: "routines" }],
  },
  sales: {
    id: "custom:sales",
    name: "Sales",
    items: [{ list: "organization" }, { list: "contact" }, { list: "deal" }, { list: "service" }, { list: "partner" }],
  },
  customerSuccess: {
    id: "custom:customer-success",
    name: "Customer success",
    items: [{ list: "subscription" }, { list: "onboarding" }],
  },
  support: { id: "custom:support", name: "Support", items: [{ list: "ticket" }] },
  marketing: { id: "custom:marketing", name: "Marketing", items: [{ list: "campaign" }] },
  hiring: { id: "custom:hiring", name: "Hiring", items: [{ list: "openRole" }, { list: "candidate" }] },
  work: { id: "custom:work", name: "Work", items: [{ list: "task" }] },
};
type SectionKey = keyof typeof SECTIONS;

const ADMIN_ORDER: SectionKey[] = ["overview", "sales", "customerSuccess", "support", "marketing", "hiring", "work"];

/** The section each member's team works in; it leads their sidebar. */
const TEAM_SECTION: Record<MemberKey, SectionKey | null> = {
  maxBergmann: null,
  sofiaRossi: "sales",
  claraNeumann: "sales",
  marcoSilva: "sales",
  elenaHoffmann: "customerSuccess",
  kianRahimi: "support",
  lauraFischer: "hiring",
};

const ALL_LISTS = Object.values(SECTIONS).flatMap(({ items }) =>
  items.flatMap((entry) => ("list" in entry ? [entry.list] : [])),
);

function readableLists(member: MemberKey): Set<ListKey> {
  const roleId = NORTHWIND_MEMBER_ROLES[member];
  if (roleId === NORTHWIND_ROLE_IDS.admin) return new Set(ALL_LISTS);
  const role = SYNTHETIC_ROLE_DEFINITIONS.find(({ id }) => id === roleId);
  return new Set(
    (role?.recordGrants ?? [])
      .filter(([, actions]) => actions.some((action) => action === "readAll" || action === "readOwn"))
      .map(([kind]) => kind as ListKey),
  );
}

/** The personal sidebar layout of a member: team section first, then the others; unreadable lists stay hidden. */
export function northwindSidebarLayout(companyId: string, member: MemberKey): SidebarLayout {
  const listItem = (list: ListKey) => `records:${presetId(companyId, list)}`;
  const readable = readableLists(member);
  const team = TEAM_SECTION[member];
  const order = team ? [team, ...ADMIN_ORDER.filter((key) => key !== team)] : ADMIN_ORDER;
  const entries = order.flatMap((key) => {
    const section = SECTIONS[key];
    const items = section.items.flatMap((entry) =>
      "item" in entry ? [entry.item] : readable.has(entry.list) ? [listItem(entry.list)] : [],
    );
    if (!items.some((item) => item.startsWith("records:")) && key !== "overview") return [];
    return [{ id: section.id, ...(section.name ? { name: section.name } : {}), items }];
  });
  const hidden = ALL_LISTS.filter((list) => !readable.has(list)).map(listItem);
  return SidebarLayoutSchema.parse({ entries, hidden });
}

export async function seedSidebars(context: SeedContext): Promise<void> {
  const companyId = context.ids.company;
  const members = Object.keys(NORTHWIND_MEMBER_IDS) as MemberKey[];
  for (const [index, member] of members.entries()) {
    const userId = NORTHWIND_MEMBER_IDS[member];
    const data = {
      companyId,
      userId,
      p13nId: SIDEBAR_P13N_ID,
      settings: northwindSidebarLayout(companyId, member),
    };
    await context.prisma.p13n.upsert({
      where: { companyId_userId_p13nId: { companyId, userId, p13nId: SIDEBAR_P13N_ID } },
      create: { id: fixtureId(SYNTHETIC_SIDEBAR_P13N_ID_PREFIX, index + 1), ...data },
      update: data,
    });
  }
}
