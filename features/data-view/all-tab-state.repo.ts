import type { PersonalizationStateWrite } from "./data-view-row-mapping";

export abstract class AllTabStateRepo {
  abstract upsertP13n(
    data: PersonalizationStateWrite & { p13nId: string },
  ): Promise<PersonalizationStateWrite & { p13nId: string }>;
}
