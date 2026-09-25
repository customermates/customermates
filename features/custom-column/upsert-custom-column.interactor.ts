import type { EventService } from "@/features/event/event.service";
import type { UserService } from "@/features/user/user.service";
import type { Data } from "@/core/validation/validation.utils";
import type { ValidateCustomColumnIdsInteractor } from "@/core/validation/validators/validate-custom-column-ids.interactor";
import type { GetDealWeightingColumnRepo } from "@/features/company/get-deal-weighting-column.repo";

import { z } from "zod";
import { Action, CustomColumnType, EntityType, Resource, Currency } from "@/generated/prisma";

import { type CustomColumnDto, CustomColumnDtoSchema } from "./custom-column.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { BULK_WRITE_TRANSACTION } from "@/core/decorators/transaction.decorator";
import { type Validated, zx } from "@/core/validation/validation.utils";
import { CHIP_COLORS } from "@/constants/chip-colors";
import { DATE_DISPLAY_FORMATS } from "@/constants/date-format";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export const OptionSchema = z.object({
  value: z
    .uuid()
    .describe(
      "Stable option id: use a fresh uuid for a brand-new option, or keep an existing option's value to preserve its stored records.",
    ),
  label: zx.nonBlankText(255),
  color: z.enum(CHIP_COLORS),
  isDefault: z.boolean(),
  index: z.number().min(0),
  weight: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe(
      "Win probability of this stage as a percentage, used only when the column is the company's deal weighting column. Changing it there also requires update permission on the company.",
    ),
});

const BaseSchema = z.object({
  id: z.uuid().optional(),
  label: zx.nonBlankText(255),
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

const DateRangeSchema = BaseSchema.extend({
  type: z.literal(CustomColumnType.dateRange),
  options: z
    .object({
      displayFormat: z.enum(DATE_DISPLAY_FORMATS),
    })
    .optional(),
});

const DateTimeRangeSchema = BaseSchema.extend({
  type: z.literal(CustomColumnType.dateTimeRange),
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

export const UpsertCustomColumnSchema = z.discriminatedUnion("type", [
  PlainSchema.meta({ title: "Plain" }),
  DateSchema.meta({ title: "Date" }),
  DateTimeSchema.meta({ title: "DateTime" }),
  DateRangeSchema.meta({ title: "DateRange" }),
  DateTimeRangeSchema.meta({ title: "DateTimeRange" }),
  LinkSchema.meta({ title: "Link" }),
  CurrencySchema.meta({ title: "Currency" }),
  SingleSelectSchema.meta({ title: "SingleSelect" }),
  EmailSchema.meta({ title: "Email" }),
  PhoneSchema.meta({ title: "Phone" }),
]);
export type UpsertCustomColumnData = Data<typeof UpsertCustomColumnSchema>;

export abstract class UpsertCustomColumnRepo {
  abstract findByIdOrThrow(id: string): Promise<CustomColumnDto>;
  abstract upsertCustomColumnOrThrow(args: UpsertCustomColumnData): Promise<CustomColumnDto>;
}

@TenantInteractor()
export class UpsertCustomColumnInteractor extends AuthenticatedInteractor<UpsertCustomColumnData, CustomColumnDto> {
  constructor(
    private repo: UpsertCustomColumnRepo,
    private companyRepo: GetDealWeightingColumnRepo,
    private userService: UserService,
    private eventService: EventService,
    private validator: ValidateCustomColumnIdsInteractor,
  ) {
    super();
  }

  @Write({
    input: UpsertCustomColumnSchema,
    output: CustomColumnDtoSchema,
    tx: BULK_WRITE_TRANSACTION,
    precheck: (self, data, ctx) => self.precheck(data, ctx),
  })
  async invoke(data: UpsertCustomColumnData): Validated<CustomColumnDto> {
    const resourceByEntityType: Record<EntityType, Resource> = {
      [EntityType.contact]: Resource.contacts,
      [EntityType.organization]: Resource.organizations,
      [EntityType.deal]: Resource.deals,
      [EntityType.service]: Resource.services,
      [EntityType.task]: Resource.tasks,
    };

    const previousCustomColumn = data.id ? await this.repo.findByIdOrThrow(data.id) : undefined;

    if (!previousCustomColumn)
      await this.userService.hasPermissionOrThrow(resourceByEntityType[data.entityType], Action.create);
    else {
      await this.userService.hasPermissionOrThrow(resourceByEntityType[previousCustomColumn.entityType], Action.update);

      if (previousCustomColumn.type !== data.type) {
        return failConflict(CustomErrorCode.customColumnTypeMismatch, ["type"], {
          actualType: previousCustomColumn.type,
          expectedType: data.type,
        });
      }

      if (await this.changesDealStageWeights(previousCustomColumn, data))
        await this.userService.hasPermissionOrThrow(Resource.company, Action.update);
    }

    const customColumn = await this.repo.upsertCustomColumnOrThrow(
      previousCustomColumn ? { ...data, entityType: previousCustomColumn.entityType } : data,
    );

    if (previousCustomColumn) {
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

    return { ok: true as const, data: customColumn };
  }

  private async changesDealStageWeights(previous: CustomColumnDto, data: UpsertCustomColumnData) {
    if (previous.type !== CustomColumnType.singleSelect || data.type !== CustomColumnType.singleSelect) return false;
    if ((await this.companyRepo.getDealWeightingColumnId()) !== previous.id) return false;

    const previousWeights = new Map(previous.options.options.map((option) => [option.value, option.weight]));

    return data.options.options.some((option) =>
      previousWeights.has(option.value)
        ? option.weight !== previousWeights.get(option.value)
        : (option.weight ?? 0) !== 0,
    );
  }

  private async precheck(data: UpsertCustomColumnData, ctx: z.RefinementCtx) {
    if (data.id) await this.validator.invoke([{ ids: data.id, path: ["id"] }], ctx);
  }
}
