import type { Prisma } from "@/generated/prisma";

const userReferenceSelect = { id: true, firstName: true, lastName: true, avatarUrl: true, email: true } as const;
const contactReferenceSelect = { id: true, firstName: true, lastName: true, avatarUrl: true } as const;
const organizationReferenceSelect = { id: true, name: true } as const;
const taskReferenceSelect = { id: true, name: true, type: true } as const;
const customFieldValueSelect = { columnId: true, value: true } as const;

export const dealSeedSelect = {
  id: true,
  name: true,
  totalValue: true,
  totalQuantity: true,
  weightedValue: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  organizations: { select: { organization: { select: organizationReferenceSelect } } },
  users: { select: { user: { select: userReferenceSelect } } },
  contacts: { select: { contact: { select: contactReferenceSelect } } },
  services: { select: { service: { select: { id: true, name: true, amount: true } }, quantity: true } },
  tasks: { select: { task: { select: taskReferenceSelect } } },
  customFieldValues: { select: customFieldValueSelect },
} as const satisfies Prisma.DealSelect;
