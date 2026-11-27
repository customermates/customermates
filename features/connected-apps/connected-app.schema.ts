import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

export const ConnectedAppDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  device: z.string().nullable(),
  accountWide: z.boolean(),
  connectedAt: z.date(),
  lastActiveAt: z.date(),
});

export type ConnectedApp = z.infer<typeof ConnectedAppDtoSchema>;

export const DisconnectConnectedAppSchema = z.object({
  id: z.string().min(1).max(200),
});

export type DisconnectConnectedAppData = Data<typeof DisconnectConnectedAppSchema>;
