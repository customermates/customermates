import { readFile } from "node:fs/promises";
import type { ClientBase } from "pg";

export async function installLegacyFingerprint(client: ClientBase) {
  await client.query(await readFile(new URL("./source-fingerprint.sql", import.meta.url), "utf8"));
}

export async function legacySourceFingerprint(client: ClientBase, companyId: string) {
  return (await client.query<{ value: string }>("SELECT crm_legacy_source_fingerprint($1) AS value", [companyId]))
    .rows[0].value;
}
