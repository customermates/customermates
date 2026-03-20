import { z } from "zod";

import { encodeToToon } from "./utils";

import { di } from "@/core/dependency-injection/container";
import { CreateManyServicesInteractor } from "@/features/services/upsert/create-many-services.interactor";
import { UpdateManyServicesInteractor } from "@/features/services/upsert/update-many-services.interactor";
import { BaseCreateServiceSchema } from "@/features/services/upsert/create-service-base.schema";

const McpCreateManyServicesSchema = z.object({
  services: z.array(BaseCreateServiceSchema).min(1).max(10),
});

const UpdateServicesNameAmountSchema = z.object({
  services: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string().min(1).optional(),
        amount: z.number().gt(0).optional(),
      }),
    )
    .min(1)
    .max(10),
});

const ChangeServicesUsersSchema = z.object({
  services: z
    .array(
      z.object({
        id: z.uuid(),
        userIds: z.array(z.uuid()),
      }),
    )
    .min(1)
    .max(10),
});

const ChangeServicesDealsSchema = z.object({
  services: z
    .array(
      z.object({
        id: z.uuid(),
        dealIds: z.array(z.uuid()),
      }),
    )
    .min(1)
    .max(10),
});

export const createServicesTool = {
  name: "create_services",
  description: "Create services. Run get_services_configuration first. Required: name, amount. Returns IDs.",
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: McpCreateManyServicesSchema,
  execute: async (params: z.infer<typeof McpCreateManyServicesSchema>) => {
    const result = await di.get(CreateManyServicesInteractor).invoke(params);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return encodeToToon(result.data.map((item) => item.id));
  },
};

export const updateServiceNameAmountTool = {
  name: "batch_update_service_name_amount",
  description: "Batch update: update service name/amount only. Only updates provided fields.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateServicesNameAmountSchema,
  execute: async (params: z.infer<typeof UpdateServicesNameAmountSchema>) => {
    const result = await di.get(UpdateManyServicesInteractor).invoke(params);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return `Updated ${result.data.length} service(s)`;
  },
};

export const changeServiceUsersTool = {
  name: "batch_set_service_users",
  description: "Batch update: sets (replaces) all users assigned to a service. Pass empty array to unassign all.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: ChangeServicesUsersSchema,
  execute: async (params: z.infer<typeof ChangeServicesUsersSchema>) => {
    const result = await di.get(UpdateManyServicesInteractor).invoke(params);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return `Updated ${result.data.length} service(s)`;
  },
};

export const changeServiceDealsTool = {
  name: "batch_set_service_deals",
  description: "Batch update: sets (replaces) all deals linked to a service. Pass empty array to unlink all.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: ChangeServicesDealsSchema,
  execute: async (params: z.infer<typeof ChangeServicesDealsSchema>) => {
    const result = await di.get(UpdateManyServicesInteractor).invoke(params);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return `Updated ${result.data.length} service(s)`;
  },
};
