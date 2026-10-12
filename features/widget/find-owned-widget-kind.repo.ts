import type { WidgetKind } from "@/generated/prisma";

export abstract class FindOwnedWidgetKindRepo {
  abstract findOwnedWidgetKind(id: string): Promise<WidgetKind | null>;
}
