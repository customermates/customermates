import type { UpdateManyContactsData } from "@/features/contacts/upsert/update-many-contacts.interactor";
import type { UpdateManyOrganizationsData } from "@/features/organizations/upsert/update-many-organizations.interactor";
import type { UpdateManyDealsData } from "@/features/deals/upsert/update-many-deals.interactor";
import type { UpdateManyServicesData } from "@/features/services/upsert/update-many-services.interactor";
import type { UpdateManyTasksData } from "@/features/tasks/upsert/update-many-tasks.interactor";
import type { ContactDto } from "@/features/contacts/contact.schema";
import type { OrganizationDto } from "@/features/organizations/organization.schema";
import type { DealDto } from "@/features/deals/deal.schema";
import type { ServiceDto } from "@/features/services/service.schema";
import type { TaskDto } from "@/features/tasks/task.schema";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { ValidateContactIdsInteractor } from "@/core/validation/validators/validate-contact-ids.interactor";
import type { ValidateDealIdsInteractor } from "@/core/validation/validators/validate-deal-ids.interactor";
import type { ValidateOrganizationIdsInteractor } from "@/core/validation/validators/validate-organization-ids.interactor";
import type { ValidateServiceIdsInteractor } from "@/core/validation/validators/validate-service-ids.interactor";
import type { ValidateTaskIdsInteractor } from "@/core/validation/validators/validate-task-ids.interactor";

import { z } from "zod";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { BULK_WRITE_TRANSACTION } from "@/core/decorators/transaction.decorator";
import { assertInvariant } from "@/core/errors/assert-invariant";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

const RELATION_ENTITY = ["contact", "organization", "deal", "service", "task"] as const;
const RELATION = ["organizations", "contacts", "deals", "services", "tasks", "users"] as const;

type RelationEntity = (typeof RELATION_ENTITY)[number];
type Relation = (typeof RELATION)[number];

const ALLOWED_RELATIONS: Record<RelationEntity, Relation[]> = {
  contact: ["organizations", "users", "deals", "tasks"],
  organization: ["contacts", "users", "deals", "tasks"],
  deal: ["organizations", "users", "contacts", "services", "tasks"],
  service: ["users", "deals", "tasks"],
  task: ["users", "contacts", "organizations", "deals", "services"],
};

const WRITE_FIELD: Record<RelationEntity, Partial<Record<Relation, string>>> = {
  contact: { organizations: "organizationIds", users: "userIds", deals: "dealIds", tasks: "taskIds" },
  organization: { contacts: "contactIds", users: "userIds", deals: "dealIds", tasks: "taskIds" },
  deal: { organizations: "organizationIds", users: "userIds", contacts: "contactIds", tasks: "taskIds" },
  service: { users: "userIds", deals: "dealIds", tasks: "taskIds" },
  task: {
    users: "userIds",
    contacts: "contactIds",
    organizations: "organizationIds",
    deals: "dealIds",
    services: "serviceIds",
  },
};

const Schema = z
  .object({
    entity: z.enum(RELATION_ENTITY),
    sourceId: z.string().min(1),
    relation: z.enum(RELATION),
    mode: z.enum(["add", "remove"]),
    ids: z.array(z.uuid()).min(1),
  })
  .superRefine((data, ctx) => {
    if (!ALLOWED_RELATIONS[data.entity].includes(data.relation)) {
      ctx.addIssue({
        code: "custom",
        params: {
          error: CustomErrorCode.relationNotAllowed,
          entity: data.entity,
          relation: data.relation,
          allowed: ALLOWED_RELATIONS[data.entity],
        },
        path: ["relation"],
      });
    }
  });
export type ModifyEntityRelationData = Data<typeof Schema>;

export type ModifyEntityRelationResult = {
  entity: RelationEntity;
  sourceId: string;
  relation: Relation;
  mode: "add" | "remove";
  requested: number;
  before: number;
  after: number;
};

export abstract class ModifyRelationContactRepo {
  abstract getOrThrowCompanyWide(id: string): Promise<ContactDto>;
}
export abstract class ModifyRelationOrganizationRepo {
  abstract getOrThrowCompanyWide(id: string): Promise<OrganizationDto>;
}
export abstract class ModifyRelationDealRepo {
  abstract getOrThrowCompanyWide(id: string): Promise<DealDto>;
}
export abstract class ModifyRelationServiceRepo {
  abstract getOrThrowCompanyWide(id: string): Promise<ServiceDto>;
}
export abstract class ModifyRelationTaskRepo {
  abstract getOrThrowCompanyWide(id: string): Promise<TaskDto>;
}

export abstract class ModifyRelationUpdateContactsPort {
  abstract invoke(data: UpdateManyContactsData): Validated<ContactDto[]>;
}
export abstract class ModifyRelationUpdateOrganizationsPort {
  abstract invoke(data: UpdateManyOrganizationsData): Validated<OrganizationDto[]>;
}
export abstract class ModifyRelationUpdateDealsPort {
  abstract invoke(data: UpdateManyDealsData): Validated<DealDto[]>;
}
export abstract class ModifyRelationUpdateServicesPort {
  abstract invoke(data: UpdateManyServicesData): Validated<ServiceDto[]>;
}
export abstract class ModifyRelationUpdateTasksPort {
  abstract invoke(data: UpdateManyTasksData): Validated<TaskDto[]>;
}

@TenantInteractor()
export class ModifyEntityRelationInteractor extends AuthenticatedInteractor<
  ModifyEntityRelationData,
  ModifyEntityRelationResult
> {
  constructor(
    private contactRepo: ModifyRelationContactRepo,
    private organizationRepo: ModifyRelationOrganizationRepo,
    private dealRepo: ModifyRelationDealRepo,
    private serviceRepo: ModifyRelationServiceRepo,
    private taskRepo: ModifyRelationTaskRepo,
    private updateContacts: ModifyRelationUpdateContactsPort,
    private updateOrganizations: ModifyRelationUpdateOrganizationsPort,
    private updateDeals: ModifyRelationUpdateDealsPort,
    private updateServices: ModifyRelationUpdateServicesPort,
    private updateTasks: ModifyRelationUpdateTasksPort,
    private contactValidator: ValidateContactIdsInteractor,
    private organizationValidator: ValidateOrganizationIdsInteractor,
    private dealValidator: ValidateDealIdsInteractor,
    private serviceValidator: ValidateServiceIdsInteractor,
    private taskValidator: ValidateTaskIdsInteractor,
  ) {
    super();
  }

  @Write({
    input: Schema,
    precheck: (self, data, ctx) => self.precheck(data, ctx),
    tx: BULK_WRITE_TRANSACTION,
  })
  async invoke(data: ModifyEntityRelationData): Validated<ModifyEntityRelationResult> {
    const { entity, sourceId, relation, mode, ids } = data;

    if (entity === "deal" && relation === "services") return this.modifyDealServices(sourceId, mode, ids);

    const current = await this.loadRelationIds(entity, sourceId, relation);
    const removeSet = new Set(ids);
    const next = mode === "add" ? [...new Set([...current, ...ids])] : current.filter((id) => !removeSet.has(id));

    const field = WRITE_FIELD[entity][relation];
    assertInvariant(field, `No write field for ${entity}.${relation}`);

    const result = await this.writeRelation(entity, sourceId, field, next);
    if (!result.ok) return result;

    return {
      ok: true as const,
      data: { entity, sourceId, relation, mode, requested: ids.length, before: current.length, after: next.length },
    };
  }

  private async modifyDealServices(
    sourceId: string,
    mode: "add" | "remove",
    ids: string[],
  ): Validated<ModifyEntityRelationResult> {
    const deal = await this.dealRepo.getOrThrowCompanyWide(sourceId);
    const existing = new Map(deal.services.map((service) => [service.id, service.quantity]));
    const before = existing.size;

    if (mode === "add") {
      for (const id of ids) if (!existing.has(id)) existing.set(id, 1);
    } else for (const id of ids) existing.delete(id);

    const services = [...existing.entries()].map(([serviceId, quantity]) => ({ serviceId, quantity }));
    const result = await this.updateDeals.invoke({ deals: [{ id: sourceId, services }] });
    if (!result.ok) return result;

    return {
      ok: true as const,
      data: {
        entity: "deal",
        sourceId,
        relation: "services",
        mode,
        requested: ids.length,
        before,
        after: existing.size,
      },
    };
  }

  private async loadEntity(
    entity: RelationEntity,
    id: string,
  ): Promise<ContactDto | OrganizationDto | DealDto | ServiceDto | TaskDto> {
    switch (entity) {
      case "contact":
        return this.contactRepo.getOrThrowCompanyWide(id);
      case "organization":
        return this.organizationRepo.getOrThrowCompanyWide(id);
      case "deal":
        return this.dealRepo.getOrThrowCompanyWide(id);
      case "service":
        return this.serviceRepo.getOrThrowCompanyWide(id);
      case "task":
        return this.taskRepo.getOrThrowCompanyWide(id);
    }
  }

  private async loadRelationIds(entity: RelationEntity, id: string, relation: Relation): Promise<string[]> {
    const dto = await this.loadEntity(entity, id);
    const list = (dto as Record<string, unknown>)[relation];
    if (!Array.isArray(list)) return [];
    return list.map((item) => String((item as { id: unknown }).id)).filter((value) => value.length > 0);
  }

  private async writeRelation(entity: RelationEntity, id: string, field: string, ids: string[]): Validated<unknown[]> {
    if (entity === "contact") {
      return this.updateContacts.invoke({
        contacts: [{ id: id, [field]: ids }] as UpdateManyContactsData["contacts"],
      });
    }
    if (entity === "organization") {
      return this.updateOrganizations.invoke({
        organizations: [{ id, [field]: ids }] as UpdateManyOrganizationsData["organizations"],
      });
    }
    if (entity === "deal")
      return this.updateDeals.invoke({ deals: [{ id, [field]: ids }] as UpdateManyDealsData["deals"] });
    if (entity === "service")
      return this.updateServices.invoke({ services: [{ id, [field]: ids }] as UpdateManyServicesData["services"] });
    return this.updateTasks.invoke({ tasks: [{ id, [field]: ids }] as UpdateManyTasksData["tasks"] });
  }

  private precheck(data: ModifyEntityRelationData, ctx: z.RefinementCtx) {
    const validator = {
      contact: this.contactValidator,
      organization: this.organizationValidator,
      deal: this.dealValidator,
      service: this.serviceValidator,
      task: this.taskValidator,
    }[data.entity];

    return validator.invoke([{ ids: data.sourceId, path: ["sourceId"] }], ctx);
  }
}
