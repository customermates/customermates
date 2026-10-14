import type { P13nEntry } from "./prisma-p13n.repository";
import type { UpsertP13nData } from "./upsert-p13n.interactor";

export abstract class UpsertP13nRepo {
  abstract upsertP13n(data: UpsertP13nData): Promise<P13nEntry>;
}
