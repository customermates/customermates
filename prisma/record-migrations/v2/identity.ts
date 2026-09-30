import { z } from "zod";
import type { ClientBase } from "pg";
import type { MigrationIssue } from "./legacy-model";
import { presetId } from "./contract/crm-preset";

const emailProviders = ["mail", "google", "outlook"];
const handlePatterns: Record<string, RegExp> = {
  linkedin: /linkedin\.com\/in\/([^/?#]+)/i,
  telegram: /t\.me\/([^/?#]+)/i,
  instagram: /instagram\.com\/([^/?#]+)/i,
};
function canonicalChannel(provider: string, raw: string): string | null {
  const value = raw.trim();
  if (emailProviders.includes(provider)) return z.email().safeParse(value).success ? value.toLowerCase() : null;
  if (provider === "whatsapp") {
    const phone = `+${value.replace(/[^\d]/g, "")}`;
    return z.e164().safeParse(phone).success ? phone : null;
  }
  const match = handlePatterns[provider]?.exec(value);
  let handle = (match ? match[1] : value).replace(/^@/, "").replace(/\/+$/, "");
  try {
    handle = decodeURIComponent(handle);
  } catch {
    return null;
  }
  return /^[\p{L}\p{N}\p{M}_.@+=-]{1,160}$/u.test(handle) ? handle : null;
}

export async function preflightLegacyIdentities(client: ClientBase, companyId: string) {
  const issues: MigrationIssue[] = [];
  const issue = (id: string, field: string, code: string) =>
    issues.push({ table: "ContactIdentifier", id, field, code });
  let afterId = "";
  let count = 0;
  for (;;) {
    const page = await client.query(
      `SELECT identity.*, contact.id IS NOT NULL AS "validEndpoint" FROM "ContactIdentifier" identity
       LEFT JOIN "Contact" contact ON contact."companyId" = $1 AND contact.id = identity."contactId"
       WHERE identity."companyId" = $1 AND identity.id > $2 ORDER BY identity.id LIMIT 500`,
      [companyId, afterId],
    );
    if (!page.rows.length) break;
    for (const row of page.rows) {
      count++;
      if (!row.validEndpoint) issue(row.id, "contactId", "cross_workspace_reference");
      const kind = emailProviders.includes(row.provider)
        ? "email"
        : row.provider === "whatsapp"
          ? "phone"
          : row.provider;
      if (row.channelClass !== kind) issue(row.id, "channelClass", "invalid_identity_class");
      const normalized = canonicalChannel(row.provider, row.value);
      if (normalized === null) issue(row.id, "value", "invalid_identity_value");
      else if (normalized !== row.value) issue(row.id, "value", "noncanonical_identity_value");
      if (
        row.messagingId !== null &&
        (!row.messagingId.trim() || row.messagingId !== row.messagingId.trim() || row.messagingId.length > 2000)
      )
        issue(row.id, "messagingId", "invalid_identity_value");
      if (row.displayName !== null && row.displayName.length > 500)
        issue(row.id, "displayName", "identity_value_too_long");
      if (
        row.profileUrl !== null &&
        !z
          .url({ protocol: /^https?$/ })
          .max(2000)
          .safeParse(row.profileUrl).success
      )
        issue(row.id, "profileUrl", "invalid_identity_url");
    }
    afterId = page.rows[page.rows.length - 1].id;
  }
  const duplicates = await client.query(
    `WITH keys AS (
      SELECT DISTINCT id, "channelClass", unnest(ARRAY[value, "messagingId"]) AS value FROM "ContactIdentifier" WHERE "companyId" = $1
    ) SELECT DISTINCT source.id FROM keys source JOIN (
      SELECT "channelClass", value FROM keys WHERE value IS NOT NULL GROUP BY "channelClass", value HAVING COUNT(*) > 1
    ) duplicate USING ("channelClass", value)`,
    [companyId],
  );
  for (const row of duplicates.rows) issue(row.id, "value", "duplicate_identity_key");
  return { count, issues };
}

export async function backfillLegacyIdentities(client: ClientBase, companyId: string): Promise<void> {
  await client.query(
    `INSERT INTO "RecordIdentity" ("companyId", id, "typeId", "recordId", provider, "channelClass", value, "messagingId", "displayName", "profileUrl", "createdAt", "updatedAt")
     SELECT legacy."companyId", legacy.id, $2, legacy."contactId", legacy.provider, legacy."channelClass", legacy.value, legacy."messagingId", legacy."displayName", legacy."profileUrl", legacy."createdAt", legacy."updatedAt"
     FROM "ContactIdentifier" legacy WHERE legacy."companyId" = $1 AND NOT EXISTS (
       SELECT 1 FROM "RecordIdentity" identity WHERE identity."companyId" = $1 AND identity.id = legacy.id
     )`,
    [companyId, presetId(companyId, "contact")],
  );
  await client.query(
    `INSERT INTO "RecordIdentityKey" ("companyId", "channelClass", value, "identityId")
     SELECT $1, legacy."channelClass", key.value, legacy.id FROM "ContactIdentifier" legacy
     CROSS JOIN LATERAL (SELECT DISTINCT unnest(ARRAY[legacy.value, legacy."messagingId"]) AS value) key
     WHERE legacy."companyId" = $1 AND key.value IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM "RecordIdentityKey" existing WHERE existing."companyId" = $1 AND existing."channelClass" = legacy."channelClass" AND existing.value = key.value
     )`,
    [companyId],
  );
}

export async function reconcileLegacyIdentities(client: ClientBase, companyId: string): Promise<MigrationIssue[]> {
  const identities = await client.query(
    `SELECT COALESCE(legacy.id, identity.id) AS id FROM (SELECT * FROM "ContactIdentifier" WHERE "companyId" = $1) legacy
     FULL JOIN (SELECT * FROM "RecordIdentity" WHERE "companyId" = $1) identity ON legacy.id = identity.id
     WHERE legacy.id IS NULL OR identity.id IS NULL OR identity."typeId" <> $2 OR
       ROW(legacy."contactId", legacy.provider, legacy."channelClass", legacy.value, legacy."messagingId", legacy."displayName", legacy."profileUrl", legacy."createdAt", legacy."updatedAt")
       IS DISTINCT FROM ROW(identity."recordId", identity.provider, identity."channelClass", identity.value, identity."messagingId", identity."displayName", identity."profileUrl", identity."createdAt", identity."updatedAt")`,
    [companyId, presetId(companyId, "contact")],
  );
  const keys = await client.query(
    `WITH expected AS (
       SELECT DISTINCT id, "channelClass", unnest(ARRAY[value, "messagingId"]) AS value FROM "ContactIdentifier" WHERE "companyId" = $1
     ) SELECT COALESCE(expected.id, actual."identityId") AS id FROM (SELECT * FROM expected WHERE value IS NOT NULL) expected
       FULL JOIN (SELECT * FROM "RecordIdentityKey" WHERE "companyId" = $1) actual USING ("channelClass", value)
       WHERE expected.id IS DISTINCT FROM actual."identityId"`,
    [companyId],
  );
  return [
    ...identities.rows.map((row) => ({
      table: "ContactIdentifier",
      id: row.id,
      field: "identity",
      code: "reconciliation_mismatch",
    })),
    ...keys.rows.map((row) => ({
      table: "ContactIdentifier",
      id: row.id,
      field: "keys",
      code: "reconciliation_mismatch",
    })),
  ];
}
