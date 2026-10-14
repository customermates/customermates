import type { EventLog } from "@/generated/prisma";
import type { ActivityMemberDto, ActivitySubjectDto } from "./activities.schema";

import { z } from "zod";

import { DomainEvent } from "@/features/event/domain-events";
import { extractAuditChanges } from "@/features/event/audit-changes";
import { WIKI_PAGE_AUDIT_EVENTS } from "@/features/wiki/wiki-audit-events";
import { NAMED_ACTIVITY_SUBJECT_KINDS } from "./activities.schema";

const SYSTEM_ACTIVITY_AUDIT_EVENTS = [
  DomainEvent.USER_REGISTERED,
  DomainEvent.USER_UPDATED,
  DomainEvent.ROLE_CREATED,
  DomainEvent.ROLE_UPDATED,
  DomainEvent.ROLE_DELETED,
  DomainEvent.WEBHOOK_CREATED,
  DomainEvent.WEBHOOK_UPDATED,
  DomainEvent.WEBHOOK_DELETED,
  DomainEvent.ROUTINE_CREATED,
  DomainEvent.ROUTINE_UPDATED,
  DomainEvent.ROUTINE_DELETED,
  DomainEvent.ROUTINE_RESTORED,
  DomainEvent.ROUTINE_DELETED_PERMANENTLY,
  DomainEvent.CONNECTED_ACCOUNT_CREATED,
  DomainEvent.CONNECTED_ACCOUNT_DELETED,
  DomainEvent.CONNECTED_ACCOUNT_UPDATED,
  DomainEvent.CONNECTED_ACCOUNT_RECONNECTED,
  DomainEvent.CONNECTED_ACCOUNT_RESYNCED,
  DomainEvent.LEGAL_NOTICE_SENT,
  DomainEvent.LEGAL_DOCUMENTS_ACCEPTED,
  DomainEvent.RECORDS_EXPORTED,
] as const;

const WIKI_ACTIVITY_AUDIT_EVENTS = WIKI_PAGE_AUDIT_EVENTS;

const systemEvents = new Set<string>([...SYSTEM_ACTIVITY_AUDIT_EVENTS, ...WIKI_ACTIVITY_AUDIT_EVENTS]);

export function systemActivityAuditEvents(canReadWiki: boolean): string[] {
  return [...SYSTEM_ACTIVITY_AUDIT_EVENTS, ...(canReadWiki ? WIKI_ACTIVITY_AUDIT_EVENTS : [])];
}

export function isSystemActivityAuditEvent(
  event: string,
): event is (typeof SYSTEM_ACTIVITY_AUDIT_EVENTS)[number] | (typeof WIKI_ACTIVITY_AUDIT_EVENTS)[number] {
  return systemEvents.has(event);
}

export function systemActivityChanges(event: string, payload: unknown, isAdmin: boolean) {
  if (!isSystemActivityAuditEvent(event) || (event === DomainEvent.RECORDS_EXPORTED && !isAdmin)) return [];
  try {
    return extractAuditChanges(payload);
  } catch {
    return [];
  }
}

const NamedSchema = z.object({ name: z.string() }).transform((subject) => subject.name);

const SUBJECT_LABELS: Record<(typeof NAMED_ACTIVITY_SUBJECT_KINDS)[number], z.ZodType<string>> = {
  role: NamedSchema,
  routine: NamedSchema,
  webhook: z.object({ url: z.string() }).transform((webhook) => webhook.url),
  wiki_page: z.object({ title: z.string() }).transform((page) => page.title),
  connected_account: z
    .object({ displayName: z.string().nullish(), emailAddress: z.string().nullish() })
    .transform((account) => account.displayName?.trim() || account.emailAddress || ""),
};

const StoredMemberNameSchema = z.object({ firstName: z.string(), lastName: z.string() });

function subjectSnapshot(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !("changes" in payload)) return payload;
  return Object.entries(payload).find(([key]) => key !== "changes")?.[1];
}

export function activitySubject(
  event: Pick<EventLog, "subjectKind" | "subjectId" | "payload">,
  members: readonly ActivityMemberDto[],
): ActivitySubjectDto | null {
  const snapshot = subjectSnapshot(event.payload);
  if (event.subjectKind === "user") {
    const stored = StoredMemberNameSchema.safeParse(snapshot).data;
    return {
      kind: "user",
      member: members.find((member) => member.id === event.subjectId) ?? {
        id: event.subjectId,
        firstName: stored?.firstName ?? "",
        lastName: stored?.lastName ?? "",
        avatarUrl: null,
      },
    };
  }
  const kind = NAMED_ACTIVITY_SUBJECT_KINDS.find((candidate) => candidate === event.subjectKind);
  const label = kind ? SUBJECT_LABELS[kind].safeParse(snapshot).data?.trim() : undefined;
  return kind && label ? { kind, id: event.subjectId, label } : null;
}
