import type { PrecheckFn } from "@/core/validation/run-precheck";
import type { Validated } from "@/core/validation/validation.utils";
import type { z } from "zod";

import { Resource, Action } from "@/generated/prisma";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { CreateManyContactsSchema } from "@/features/contacts/upsert/create-many-contacts.interactor";
import { CreateManyDealsSchema } from "@/features/deals/upsert/create-many-deals.interactor";
import { CreateManyOrganizationsSchema } from "@/features/organizations/upsert/create-many-organizations.interactor";
import { CreateManyServicesSchema } from "@/features/services/upsert/create-many-services.interactor";
import { CreateManyTasksSchema } from "@/features/tasks/upsert/create-many-tasks.interactor";
import { DryRunImportSchema, type DryRunImportData } from "../data-transfer.schema";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { UpdateManyContactsSchema } from "@/features/contacts/upsert/update-many-contacts.interactor";
import { UpdateManyDealsSchema } from "@/features/deals/upsert/update-many-deals.interactor";
import { UpdateManyOrganizationsSchema } from "@/features/organizations/upsert/update-many-organizations.interactor";
import { UpdateManyServicesSchema } from "@/features/services/upsert/update-many-services.interactor";
import { UpdateManyTasksSchema } from "@/features/tasks/upsert/update-many-tasks.interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { getZodParseContext } from "@/core/validation/zod-error-map-server";
import { runPrecheck } from "@/core/validation/run-precheck";

export type BulkWritePrecheck = {
  createMany: PrecheckFn<never>;
  updateMany: PrecheckFn<never>;
};

const writePermissions = (resource: Resource) => ({
  permissions: [
    { resource, action: Action.create },
    { resource, action: Action.update },
  ],
  condition: "OR" as const,
});

export abstract class BaseDryRunImportInteractor extends AuthenticatedInteractor<DryRunImportData, null> {
  constructor(
    private collectionKey: string,
    private createSchema: z.ZodType,
    private updateSchema: z.ZodType,
    private precheck: BulkWritePrecheck,
  ) {
    super();
  }

  async invoke(data: DryRunImportData): Validated<null> {
    const schema = data.mode === "create" ? this.createSchema : this.updateSchema;
    const context = await getZodParseContext();
    const parsed = await schema.safeParseAsync({ [this.collectionKey]: data.rows }, context);

    if (!parsed.success) return { ok: false as const, error: parsed.error };

    const checked = await runPrecheck(parsed.data, (value, ctx) =>
      data.mode === "create"
        ? this.precheck.createMany(value as never, ctx)
        : this.precheck.updateMany(value as never, ctx),
    );

    if (!checked.ok) return { ok: false as const, error: checked.error };

    return { ok: true as const, data: null };
  }
}

@AllowInDemoMode
@TenantInteractor(writePermissions(Resource.contacts))
export class DryRunImportContactsInteractor extends BaseDryRunImportInteractor {
  constructor(precheck: BulkWritePrecheck) {
    super("contacts", CreateManyContactsSchema, UpdateManyContactsSchema, precheck);
  }

  @Validate(DryRunImportSchema)
  async invoke(data: DryRunImportData): Validated<null> {
    return await super.invoke(data);
  }
}

@AllowInDemoMode
@TenantInteractor(writePermissions(Resource.organizations))
export class DryRunImportOrganizationsInteractor extends BaseDryRunImportInteractor {
  constructor(precheck: BulkWritePrecheck) {
    super("organizations", CreateManyOrganizationsSchema, UpdateManyOrganizationsSchema, precheck);
  }

  @Validate(DryRunImportSchema)
  async invoke(data: DryRunImportData): Validated<null> {
    return await super.invoke(data);
  }
}

@AllowInDemoMode
@TenantInteractor(writePermissions(Resource.deals))
export class DryRunImportDealsInteractor extends BaseDryRunImportInteractor {
  constructor(precheck: BulkWritePrecheck) {
    super("deals", CreateManyDealsSchema, UpdateManyDealsSchema, precheck);
  }

  @Validate(DryRunImportSchema)
  async invoke(data: DryRunImportData): Validated<null> {
    return await super.invoke(data);
  }
}

@AllowInDemoMode
@TenantInteractor(writePermissions(Resource.services))
export class DryRunImportServicesInteractor extends BaseDryRunImportInteractor {
  constructor(precheck: BulkWritePrecheck) {
    super("services", CreateManyServicesSchema, UpdateManyServicesSchema, precheck);
  }

  @Validate(DryRunImportSchema)
  async invoke(data: DryRunImportData): Validated<null> {
    return await super.invoke(data);
  }
}

@AllowInDemoMode
@TenantInteractor(writePermissions(Resource.tasks))
export class DryRunImportTasksInteractor extends BaseDryRunImportInteractor {
  constructor(precheck: BulkWritePrecheck) {
    super("tasks", CreateManyTasksSchema, UpdateManyTasksSchema, precheck);
  }

  @Validate(DryRunImportSchema)
  async invoke(data: DryRunImportData): Validated<null> {
    return await super.invoke(data);
  }
}
