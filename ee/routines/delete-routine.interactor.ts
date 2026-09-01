import type { RoutineDto } from "./routine.schema";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

const Schema = z.object({ id: z.uuid() });

export type DeleteRoutineData = Data<typeof Schema>;

export abstract class DeleteRoutineRepo {
  abstract deleteRoutineOrThrow(id: string): Promise<RoutineDto>;
}

@TenantInteractor({ resource: Resource.api, action: Action.delete })
export class DeleteRoutineInteractor extends AuthenticatedInteractor<DeleteRoutineData, string> {
  constructor(private repo: DeleteRoutineRepo) {
    super();
  }

  @Write({ input: Schema, output: z.string() })
  async invoke(data: DeleteRoutineData): Validated<string> {
    await this.repo.deleteRoutineOrThrow(data.id);

    return { ok: true as const, data: data.id };
  }
}
