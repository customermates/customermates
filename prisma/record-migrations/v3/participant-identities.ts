import { retryMigrationTransaction } from "../retry-transaction";
import { z } from "zod";
import type { ClientBase } from "pg";

export function participantLookupValue(provider: string, raw: string | null): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (["mail", "google", "outlook"].includes(provider))
    return z.email().safeParse(value).success ? value.toLowerCase() : value;
  if (provider === "whatsapp") {
    const phone = `+${value.replace(/[^\d]/g, "")}`;
    return z.e164().safeParse(phone).success ? phone : value;
  }
  const patterns: Record<string, RegExp> = {
    linkedin: /linkedin\.com\/in\/([^/?#]+)/i,
    telegram: /t\.me\/([^/?#]+)/i,
    instagram: /instagram\.com\/([^/?#]+)/i,
  };
  const match = patterns[provider]?.exec(value);
  let handle = (match ? match[1] : value).replace(/^@/, "").replace(/\/+$/, "");
  try {
    handle = decodeURIComponent(handle);
  } catch {
    return value;
  }
  return /^[\p{L}\p{N}\p{M}_.@+=-]{1,160}$/u.test(handle) ? handle : value;
}

async function migrateParticipantLookupsOnce(
  client: ClientBase,
  companyId: string,
  mode: "preflight" | "backfill" | "reconcile",
) {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [companyId]);
    let afterId = "";
    let count = 0;
    let changed = 0;
    const mismatches: string[] = [];
    for (;;) {
      const page = await client.query<{
        id: string;
        provider: string;
        identifier: string | null;
        identityLookupValue: string | null;
      }>(
        `SELECT id, provider, identifier, "identityLookupValue" FROM "MessagingThreadParticipant"
         WHERE "companyId" = $1 AND id > $2 ORDER BY id LIMIT 500`,
        [companyId, afterId],
      );
      if (!page.rows.length) break;
      const updates = page.rows.flatMap((row) => {
        count++;
        const value = participantLookupValue(row.provider, row.identifier);
        if (value === row.identityLookupValue) return [];
        changed++;
        if (mode === "reconcile") mismatches.push(row.id);
        return [{ id: row.id, value }];
      });
      if (mode === "backfill" && updates.length) {
        await client.query(
          `UPDATE "MessagingThreadParticipant" participant SET "identityLookupValue" = source.value
           FROM unnest($2::text[], $3::text[]) AS source(id, value)
           WHERE participant."companyId" = $1 AND participant.id = source.id`,
          [companyId, updates.map((row) => row.id), updates.map((row) => row.value)],
        );
      }
      afterId = page.rows[page.rows.length - 1].id;
    }
    await client.query(mode === "backfill" ? "COMMIT" : "ROLLBACK");
    return { ok: !mismatches.length, count, changed, mismatches };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export function migrateParticipantLookups(
  client: ClientBase,
  companyId: string,
  mode: "preflight" | "backfill" | "reconcile",
) {
  return retryMigrationTransaction(() => migrateParticipantLookupsOnce(client, companyId, mode));
}
