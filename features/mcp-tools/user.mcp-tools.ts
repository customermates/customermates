import { z } from "zod";
import { CountryCode } from "@/generated/prisma";

import { encodeToToon, enumHint, runInteractor } from "./utils";

import { getGetUserDetailsInteractor, getGetUsersInteractor, getUpdateUserDetailsInteractor } from "@/core/di";
import { UpdateUserDetailsSchema } from "@/features/user/upsert/update-user-details.interactor";

const countryValues = Object.values(CountryCode);

const UpdateMyProfileSchema = UpdateUserDetailsSchema.extend({
  country: UpdateUserDetailsSchema.shape.country.describe(`ISO country code ${enumHint(countryValues)}`),
  avatarUrl: UpdateUserDetailsSchema.shape.avatarUrl
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
    const avatarUrl =
      params.avatarUrl === undefined
        ? ((await getGetUserDetailsInteractor().invoke()).data.avatarUrl ?? null)
        : params.avatarUrl;
    return runInteractor(
      getUpdateUserDetailsInteractor().invoke({
        firstName: params.firstName,
        lastName: params.lastName,
        country: params.country,
        avatarUrl,
      }),
      (data) => encodeToToon({ firstName: data.firstName, lastName: data.lastName, message: "Profile updated" }),
    );
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
  execute: () =>
    runInteractor(getGetUsersInteractor().invoke({ pagination: { page: 1, pageSize: 100 } }), (data) =>
      encodeToToon({
        items: data.items.map((item) => ({ id: item.id, firstName: item.firstName, lastName: item.lastName })),
        total: data.pagination?.total ?? data.items.length,
      }),
    ),
};
