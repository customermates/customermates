import { UnipileClient } from "unipile-node-sdk";

import { env } from "@/env";

let client: UnipileClient | undefined;

export function getUnipileClient(): UnipileClient {
  if (client) return client;

  if (!env.UNIPILE_DSN) throw new Error("UNIPILE_DSN env var is not set");
  if (!env.UNIPILE_API_KEY) throw new Error("UNIPILE_API_KEY env var is not set");

  client = new UnipileClient(env.UNIPILE_DSN, env.UNIPILE_API_KEY);

  return client;
}
