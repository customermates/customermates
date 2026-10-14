import type { Prisma } from "@/generated/prisma";

export const LIVE_WIDGET = {
  deletedAt: null,
  NOT: { view: { is: { deletedAt: { not: null } } } },
} satisfies Prisma.WidgetWhereInput;
