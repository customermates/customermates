import { z } from "zod";

import { encodeToToon } from "./utils";

import { getGetUserDetailsInteractor, getGetUsersInteractor } from "@/core/di";

export const getUserDetailsTool = {
  name: "get_user_details",
  description: "Get the current authenticated user's profile.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: z.object({}),
  execute: async () => {
    const result = await getGetUserDetailsInteractor().invoke();
    return encodeToToon(result.data);
  },
};

export const getUsersTool = {
  name: "get_users",
  description: "Get all users in the company. Returns id, firstName, lastName.",
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
      pagination: result.data.pagination,
    });
  },
};
