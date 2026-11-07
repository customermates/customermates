import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

export const PublicLinkSettingsSchema = z
  .object({
    allowPublicLinks: z.boolean(),
    activeLinkCount: z.number().int().min(0),
  })
  .strict();
export type PublicLinkSettings = Data<typeof PublicLinkSettingsSchema>;

export const SetPublicLinksAllowedSchema = z.object({ allowPublicLinks: z.boolean() }).strict();
export type SetPublicLinksAllowedData = Data<typeof SetPublicLinksAllowedSchema>;
