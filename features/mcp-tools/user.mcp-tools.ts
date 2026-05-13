import { z } from "zod";
import { CountryCode } from "@/generated/prisma";

import { encodeToToon, enumHint } from "./utils";

import { getGetUserDetailsInteractor, getGetUsersInteractor, getUpdateUserDetailsInteractor } from "@/core/app-di";

const countryValues = Object.values(CountryCode);

const UpdateMyProfileSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  country: z.enum(CountryCode).describe(`ISO country code ${enumHint(countryValues)}`),
  avatarUrl: z
    .url()
    .or(z.literal(""))
    .nullable()
    .optional()
    .describe("HTTPS avatar URL, or '' / null to clear. Omit to keep existing."),
});

export const getCurrentUserTool = {
  name: "get_current_user",
  description: "Return the authenticated user's own profile. No arguments.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: z.object({}),
  execute: async () => {
    const result = await getGetUserDetailsInteractor().invoke();
    return encodeToToon(result.data);
  },
};

export const updateMyProfileTool = {
  name: "update_my_profile",
  description:
    "Update the authenticated user's own profile. " +
    "Required: firstName, lastName, country. Optional: avatarUrl. " +
    `country ${enumHint(countryValues)}. ` +
    "Full overwrite — send all required fields each time.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateMyProfileSchema,
  execute: async (params: z.infer<typeof UpdateMyProfileSchema>) => {
    const result = await getUpdateUserDetailsInteractor().invoke({
      firstName: params.firstName,
      lastName: params.lastName,
      country: params.country,
      avatarUrl: params.avatarUrl ?? null,
    });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return encodeToToon({
      firstName: result.data.firstName,
      lastName: result.data.lastName,
      message: "Profile updated",
    });
  },
};

export const listUsersTool = {
  name: "list_users",
  description:
    "List every user in the company. " +
    "Returns { id, firstName, lastName } per user. " +
    "Use this to look up user ids before calling link_entities / update_* with userIds.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: z.object({}),
  execute: async () => {
    const result = await getGetUsersInteractor().invoke();
    if (!result.ok) return encodeToToon({ items: [] });
    return encodeToToon({
      items: result.data.items.map((item) => ({
        id: item.id,
        firstName: item.firstName,
        lastName: item.lastName,
      })),
      total: result.data.pagination?.total ?? result.data.items.length,
    });
  },
};
