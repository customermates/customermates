import type { Prisma, Widget, WidgetKind } from "@/generated/prisma";

export type OwnedWidgetWrite = {
  companyId: string;
  userId: string;
  id: string;
  update: { expectedVersion: number | undefined } | null;
  data: {
    name: string;
    kind: WidgetKind;
    measure?: Prisma.InputJsonValue;
    activityQuery?: Prisma.InputJsonValue;
    displayOptions: Prisma.InputJsonValue;
    isTemplate: boolean;
    viewId: string | null;
    layout?: Prisma.InputJsonValue;
  };
};

export abstract class OwnedWidgetWriteRepo {
  abstract saveOwnedWidget(write: OwnedWidgetWrite): Promise<Widget>;
}
