import { z } from "zod";
import { Action, CustomColumnType, EntityType, Resource, Currency } from "@/generated/prisma";

import { CustomColumnDto } from "./custom-column.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { UserService } from "@/features/user/user.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { CHIP_COLORS } from "@/constants/chip-colors";
import { DATE_DISPLAY_FORMATS } from "@/constants/date-format";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { UserAccessor } from "@/core/base/user-accessor";

const OptionSchema = z.object({
  value: z.uuid(),
  label: z.string().min(1),
  color: z.enum(CHIP_COLORS),
  isDefault: z.boolean(),
  index: z.number().min(0),
});

const BaseSchema = z.object({
  id: z.uuid().optional(),
  label: z.string().min(1),
  entityType: z.enum(EntityType),
});

const PlainSchema = BaseSchema.extend({
  type: z.literal(CustomColumnType.plain),
});

const DateSchema = BaseSchema.extend({
  type: z.literal(CustomColumnType.date),
  options: z
    .object({
      displayFormat: z.enum(DATE_DISPLAY_FORMATS),
    })
    .optional(),
});

const DateTimeSchema = BaseSchema.extend({
  type: z.literal(CustomColumnType.dateTime),
  options: z
    .object({
      displayFormat: z.enum(DATE_DISPLAY_FORMATS),
    })
    .optional(),
});

const LinkSchema = BaseSchema.extend({
  type: z.literal(CustomColumnType.link),
  options: z.object({
    color: z.enum(CHIP_COLORS),
    allowMultiple: z.boolean(),
  }),
});

const CurrencySchema = BaseSchema.extend({
  type: z.literal(CustomColumnType.currency),
  options: z.object({
    currency: z.enum(Currency),
  }),
});

const SingleSelectSchema = BaseSchema.extend({
  type: z.literal(CustomColumnType.singleSelect),
  options: z.object({
    options: z.array(OptionSchema).min(1),
  }),
});

const EmailSchema = BaseSchema.extend({
  type: z.literal(CustomColumnType.email),
  options: z.object({
    color: z.enum(CHIP_COLORS),
    allowMultiple: z.boolean(),
  }),
});

const PhoneSchema = BaseSchema.extend({
  type: z.literal(CustomColumnType.phone),
  options: z.object({
    color: z.enum(CHIP_COLORS),
    allowMultiple: z.boolean(),
  }),
});

const UpsertCustomColumnSchema = z.discriminatedUnion("type", [
  PlainSchema.meta({ title: "Plain" }),
  DateSchema.meta({ title: "Date" }),
  DateTimeSchema.meta({ title: "DateTime" }),
  LinkSchema.meta({ title: "Link" }),
  CurrencySchema.meta({ title: "Currency" }),
  SingleSelectSchema.meta({ title: "SingleSelect" }),
  EmailSchema.meta({ title: "Email" }),
  PhoneSchema.meta({ title: "Phone" }),
]);
export type UpsertCustomColumnData = Data<typeof UpsertCustomColumnSchema>;

export abstract class UpsertCustomColumnRepo {
  abstract find(id: string): Promise<CustomColumnDto>;
  abstract upsertCustomColumn(args: UpsertCustomColumnData): Promise<CustomColumnDto>;
}

@TentantInteractor()
export class UpsertCustomColumnInteractor extends UserAccessor {
  constructor(
    private repo: UpsertCustomColumnRepo,
    private userService: UserService,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(UpsertCustomColumnSchema)
  async invoke(data: UpsertCustomColumnData): Validated<CustomColumnDto, UpsertCustomColumnData> {
    const updatePermissionMap: Record<EntityType, { resource: Resource; action: Action }> = {
      [EntityType.contact]: { resource: Resource.contacts, action: Action.update },
      [EntityType.organization]: { resource: Resource.organizations, action: Action.update },
      [EntityType.deal]: { resource: Resource.deals, action: Action.update },
      [EntityType.service]: { resource: Resource.services, action: Action.update },
      [EntityType.task]: { resource: Resource.tasks, action: Action.update },
    };

    const createPermissionMap: Record<EntityType, { resource: Resource; action: Action }> = {
      [EntityType.contact]: { resource: Resource.contacts, action: Action.create },
      [EntityType.organization]: { resource: Resource.organizations, action: Action.create },
      [EntityType.deal]: { resource: Resource.deals, action: Action.create },
      [EntityType.service]: { resource: Resource.services, action: Action.create },
      [EntityType.task]: { resource: Resource.tasks, action: Action.create },
    };

    const permission = data.id ? updatePermissionMap[data.entityType] : createPermissionMap[data.entityType];

    if (!permission) throw new Error("You are not allowed to delete this custom column");

    await this.userService.hasPermissionOrThrow(permission.resource, permission.action);

    const isUpdate = Boolean(data.id);
    const previousCustomColumn = data.id ? await this.repo.find(data.id) : undefined;
    const customColumn = await this.repo.upsertCustomColumn(data);

    if (isUpdate && previousCustomColumn) {
      const changes = calculateChanges(previousCustomColumn, customColumn);

      await this.eventService.publish(DomainEvent.CUSTOM_COLUMN_UPDATED, {
        entityId: customColumn.id,
        payload: {
          customColumn,
          changes,
        },
      });
    } else {
      await this.eventService.publish(DomainEvent.CUSTOM_COLUMN_CREATED, {
        entityId: customColumn.id,
        payload: customColumn,
      });
    }

    return { ok: true, data: customColumn };
  }
}
