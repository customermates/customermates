import { isDeepStrictEqual } from "node:util";

import { SIDEBAR_P13N_ID } from "@/features/p13n/sidebar-layout.schema";
import { writeStoredState } from "@/features/data-view/data-view-row-mapping";
import { RecordModelSchema, type RecordModel } from "@/features/records/record-model.schema";
import { compareRecordKey } from "@/features/records/record-json";
import { encodeRecordValue } from "@/features/records/record-storage";
import { Prisma, type PrismaClient } from "@/generated/prisma";

import type { SeedContext } from "../context";
import { fixtureId, reconcileDomainUserId, upsertFixturesById, workspaceFixtureId } from "../helpers";
import { seedWorkspaceMessaging } from "../messaging/seed";
import { seedSolutionRoutines } from "../routines";
import { seedWebhooks } from "../webhooks";
import { calculateSyntheticRecords, initializeRecordModel } from "../records";
import { writeSyntheticRecordHistory } from "../record-history";
import { TEAM_MEMBER_IDS } from "../team";
import { SYNTHETIC_SEED_TIMELINE, storyMoment } from "../timeline";
import type { SolutionContent } from "./define-solution";
import {
  SOLUTION_IDENTITY_PREFIX,
  SOLUTION_LINK_PREFIX,
  SOLUTION_RECORD_EVENT_PREFIX,
  buildSolutionRecordData,
  solutionRecordPrefixes,
  solutionColleagueId,
  type SolutionRecordData,
} from "./solution-data";
import { seedSolutionMateChats, seedSolutionPlanner, seedSolutionTrash } from "./solution-extras";
import { seedSolutionFiles, solutionFileValues } from "./solution-files";
import { buildSolutionMessaging } from "./solution-messaging";
import {
  SOLUTION_VIEW_GROUP,
  SOLUTION_WIDGET_GROUP,
  SOLUTION_WIKI_GROUP,
  buildSolutionViews,
  buildSolutionWidgets,
  buildSolutionWiki,
  type SolutionWikiRow,
} from "./solution-presentation";
import type { SolutionWorkspace } from "./solution-workspaces";

export type SolutionSeedCounts = {
  slug: string;
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
  durationMs: number;
};

const LONG_TRANSACTION = { maxWait: 60000, timeout: 600000 } as const;

export const SOLUTION_SUBSCRIPTION = { plan: "pro", quantity: null, status: "active" } as const;

/**
 * When a demo workspace was created: two weeks before its oldest record, so every record, view and page is younger
 * than the workspace. The team workspace keeps the company date of the team fixtures.
 */
export function solutionWorkspaceCreatedAt(workspace: SolutionWorkspace, content: SolutionContent): Date {
  if (workspace.team) return SYNTHETIC_SEED_TIMELINE.company.createdAt;
  const oldest = Math.max(
    ...Object.values(content.records).flatMap((records) => records.map((record) => record.createdDaysAgo)),
  );
  return storyMoment(oldest + 14, Number.parseInt(workspace.tag, 10) % 600);
}

const DAY = 86_400_000;

/** Company, admin role, Max's membership and subscription of a workspace without the team fixtures. */
async function seedWorkspaceShell(context: SeedContext, workspace: SolutionWorkspace, content: SolutionContent) {
  const { prisma } = context;
  if (workspace.team) return;
  const createdAt = solutionWorkspaceCreatedAt(workspace, content);
  const company = {
    name: content.workspaceName,
    createdByAuthUserId: context.ids.user,
    createdAt,
    updatedAt: createdAt,
  };
  await prisma.company.upsert({
    where: { id: workspace.companyId },
    update: company,
    create: { id: workspace.companyId, ...company },
  });

  const role = {
    companyId: workspace.companyId,
    description: "Full access to all features and settings",
    isSystemRole: true,
    name: "Admin",
    createdAt,
    updatedAt: createdAt,
  };
  await prisma.userRole.upsert({
    where: { id: workspace.roleId },
    update: role,
    create: { id: workspace.roleId, ...role },
  });

  const profile = await prisma.user.findUniqueOrThrow({
    where: { id: TEAM_MEMBER_IDS.maxBergmann, companyId: context.ids.company },
    select: {
      avatarUrl: true,
      displayLanguage: true,
      email: true,
      firstName: true,
      formattingLocale: true,
      lastName: true,
      theme: true,
    },
  });
  const member = {
    ...profile,
    id: workspace.memberId,
    companyId: workspace.companyId,
    roleId: workspace.roleId,
    status: "active" as const,
    agreeToTerms: true,
    leftAt: null,
    agentCreditActivatedAt: createdAt,
    onboardingWizardCompletedAt: new Date(createdAt.getTime() + 35 * 60_000),
    createdAt,
    updatedAt: new Date(createdAt.getTime() + 30 * 60_000),
  } satisfies Prisma.UserUncheckedCreateInput;
  await reconcileDomainUserId(context, member.id, member);
  await prisma.user.upsert({ where: { id: member.id }, update: member, create: member });

  const colleagues = (content.members ?? []).map((colleague, index) => {
    const joined = new Date(createdAt.getTime() + (index + 1) * DAY);
    return {
      id: solutionColleagueId(workspace, colleague.key),
      companyId: workspace.companyId,
      roleId: workspace.roleId,
      email: colleague.email,
      firstName: colleague.firstName,
      lastName: colleague.lastName,
      avatarUrl: colleague.avatar,
      displayLanguage: profile.displayLanguage,
      formattingLocale: profile.formattingLocale,
      status: "active" as const,
      agreeToTerms: true,
      leftAt: null,
      agentCreditActivatedAt: joined,
      onboardingWizardCompletedAt: new Date(joined.getTime() + 35 * 60_000),
      createdAt: joined,
      updatedAt: new Date(joined.getTime() + 30 * 60_000),
    } satisfies Prisma.UserUncheckedCreateInput;
  });
  for (const colleague of colleagues) {
    await reconcileDomainUserId(context, colleague.id, colleague);
    await prisma.user.upsert({ where: { id: colleague.id }, update: colleague, create: colleague });
  }
  await prisma.user.deleteMany({
    where: {
      companyId: workspace.companyId,
      id: { startsWith: `30000000-${workspace.tag}-`, notIn: [workspace.memberId, ...colleagues.map(({ id }) => id)] },
    },
  });

  const subscription = { ...SOLUTION_SUBSCRIPTION, agentCreditAnchorAt: createdAt };
  await prisma.subscription.upsert({
    where: { companyId: workspace.companyId },
    update: subscription,
    create: { id: workspace.subscriptionId, companyId: workspace.companyId, ...subscription },
  });
}

type StoredValue = ReturnType<typeof encodeRecordValue>;

/** JSON with sorted object keys: jsonb stores keys in its own order, so stored and fresh values compare equal. */
function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => compareRecordKey(a, b))
      .map(([key, child]) => [key, canonicalJson(child)]),
  );
}

function valueDigest(value: Pick<StoredValue, Exclude<keyof StoredValue, "jsonValue">> & { jsonValue: unknown }) {
  return JSON.stringify([
    value.state,
    value.textValue,
    value.textListValue,
    value.lexicalValue,
    value.decimalValue === null ? null : new Prisma.Decimal(value.decimalValue).toString(),
    value.currency,
    value.booleanValue,
    value.instantValue?.toISOString() ?? null,
    value.rangeStart?.toISOString() ?? null,
    value.rangeEnd?.toISOString() ?? null,
    canonicalJson(value.jsonValue ?? null),
  ]);
}

/**
 * Writes the records of a workspace and reports what changed. Records the seed owns are those under the solution's
 * id prefixes; a record is rewritten only when its timestamps, input values or owner differ, and records the seed no
 * longer writes are removed. Links and identities are replaced as a set when they differ.
 */
async function writeRecords(
  prisma: PrismaClient,
  workspace: SolutionWorkspace,
  content: SolutionContent,
  model: RecordModel,
  data: SolutionRecordData,
): Promise<Omit<SolutionSeedCounts, "slug" | "durationMs"> & { changed: boolean }> {
  const { companyId } = workspace;
  const inputFields = new Set(model.fields.filter((field) => field.behavior.kind === "input").map((field) => field.id));
  const prefixes = solutionRecordPrefixes(content).map(([, prefix]) => `${prefix}-`);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${companyId}, 0))`;
    const existing = await tx.crmRecord.findMany({
      where: { companyId, OR: prefixes.map((prefix) => ({ id: { startsWith: prefix } })) },
      include: { values: true, assignments: true },
    });
    const digestOf = (
      createdAt: Date,
      updatedAt: Date,
      deletedAt: Date | null,
      values: Array<{ fieldId: string; digest: string }>,
      owners: string[],
    ) =>
      JSON.stringify([
        createdAt.toISOString(),
        updatedAt.toISOString(),
        deletedAt?.toISOString() ?? null,
        values
          .sort((a, b) => compareRecordKey(a.fieldId, b.fieldId))
          .map(({ fieldId, digest }) => `${fieldId}=${digest}`),
        owners.sort(),
      ]);
    const stored = new Map(
      existing.map((record) => [
        `${record.typeId}:${record.id}`,
        digestOf(
          record.createdAt,
          record.updatedAt,
          record.deletedAt,
          record.values
            .filter((value) => inputFields.has(value.fieldId))
            .map((value) => ({ fieldId: value.fieldId, digest: valueDigest(value) })),
          record.assignments.map((assignment) => assignment.userId),
        ),
      ]),
    );
    const encoded = data.values.map((row) => {
      const value = encodeRecordValue({ state: "value", value: row.value });
      return { ...row, encoded: value, digest: valueDigest(value) };
    });
    const desired = new Map(
      data.records.map((record) => [
        `${record.typeId}:${record.id}`,
        digestOf(
          record.createdAt,
          record.updatedAt,
          null,
          encoded
            .filter((value) => value.typeId === record.typeId && value.recordId === record.id)
            .map(({ fieldId, digest }) => ({ fieldId, digest })),
          data.assignments
            .filter((assignment) => assignment.typeId === record.typeId && assignment.recordId === record.id)
            .map((assignment) => assignment.userId),
        ),
      ]),
    );
    const created = data.records.filter((record) => !stored.has(`${record.typeId}:${record.id}`));
    const updated = data.records.filter((record) => {
      const current = stored.get(`${record.typeId}:${record.id}`);
      return current !== undefined && current !== desired.get(`${record.typeId}:${record.id}`);
    });
    const deleted = existing.filter((record) => !desired.has(`${record.typeId}:${record.id}`));

    const naturalKey = (link: { relationId: string; sourceId: string; targetId: string }) =>
      `${link.relationId}:${link.sourceId}:${link.targetId}`;
    const relationIds = [...new Set(data.links.map((link) => link.relationId))];
    const storedLinks = await tx.recordLink.findMany({
      where: {
        companyId,
        OR: [{ id: { startsWith: `${SOLUTION_LINK_PREFIX}-` } }, { relationId: { in: relationIds } }],
      },
      select: { id: true, relationId: true, sourceId: true, targetId: true, deletedAt: true },
    });
    const desiredLinkKeys = new Set(data.links.map(naturalKey));
    const presentLinkKeys = new Set(storedLinks.filter((link) => !link.deletedAt).map(naturalKey));
    const staleLinks = storedLinks.filter(
      (link) =>
        link.id.startsWith(`${SOLUTION_LINK_PREFIX}-`) && (!desiredLinkKeys.has(naturalKey(link)) || link.deletedAt),
    );
    const usedLinkIds = new Set(
      storedLinks.filter((link) => !staleLinks.includes(link)).map((link) => `${link.relationId}:${link.id}`),
    );
    const missingLinks = data.links
      .filter(
        (link) =>
          !presentLinkKeys.has(naturalKey(link)) || staleLinks.some((stale) => naturalKey(stale) === naturalKey(link)),
      )
      .map((link, index) => ({
        ...link,
        id: usedLinkIds.has(`${link.relationId}:${link.id}`)
          ? fixtureId(SOLUTION_LINK_PREFIX, 900000 + index + 1)
          : link.id,
      }));
    const linksChanged = staleLinks.length > 0 || missingLinks.length > 0;
    const storedIdentities = await tx.recordIdentity.findMany({
      where: { companyId, id: { startsWith: `${SOLUTION_IDENTITY_PREFIX}-` } },
      include: { keys: true, records: true },
      orderBy: { id: "asc" },
    });
    const identityShape = (row: {
      id: string;
      provider: string;
      channelClass: string;
      value: string;
      messagingId: string | null;
      displayName: string | null;
      profileUrl: string | null;
      keys: string[];
      records: string[];
    }) => JSON.stringify({ ...row, keys: [...row.keys].sort(), records: [...row.records].sort() });
    const identitiesChanged = !isDeepStrictEqual(
      storedIdentities.map((row) =>
        identityShape({
          id: row.id,
          provider: row.provider,
          channelClass: row.channelClass,
          value: row.value,
          messagingId: row.messagingId,
          displayName: row.displayName,
          profileUrl: row.profileUrl,
          keys: row.keys.map((key) => key.value),
          records: row.records.map((link) => `${link.typeId}:${link.recordId}`),
        }),
      ),
      [...data.identities]
        .sort((a, b) => compareRecordKey(a.id, b.id))
        .map(({ typeId, recordId, ...row }) => identityShape({ ...row, records: [`${typeId}:${recordId}`] })),
    );

    const changed = created.length + updated.length + deleted.length > 0 || linksChanged || identitiesChanged;
    if (!changed) return { created: 0, updated: 0, deleted: 0, unchanged: data.records.length, changed: false };

    for (const record of deleted) {
      await tx.crmRecord.delete({
        where: { companyId_typeId_id: { companyId, typeId: record.typeId, id: record.id } },
      });
    }
    const rewritten = [...created, ...updated];
    for (const typeId of new Set(updated.map((record) => record.typeId))) {
      const recordIds = updated.filter((record) => record.typeId === typeId).map((record) => record.id);
      await tx.recordValue.deleteMany({
        where: { companyId, typeId, recordId: { in: recordIds }, fieldId: { in: [...inputFields] } },
      });
      await tx.recordAssignment.deleteMany({ where: { companyId, typeId, recordId: { in: recordIds } } });
    }
    await tx.crmRecord.createMany({
      data: created.map(({ typeId, id, createdAt, updatedAt }) => ({ companyId, typeId, id, createdAt, updatedAt })),
    });
    for (const record of updated) {
      await tx.crmRecord.update({
        where: { companyId, companyId_typeId_id: { companyId, typeId: record.typeId, id: record.id } },
        data: { createdAt: record.createdAt, updatedAt: record.updatedAt, deletedAt: null, trashItemId: null },
      });
    }
    const rewrittenKeys = new Set(rewritten.map((record) => `${record.typeId}:${record.id}`));
    const values = encoded.filter((row) => rewrittenKeys.has(`${row.typeId}:${row.recordId}`));
    for (let start = 0; start < values.length; start += 2000) {
      await tx.recordValue.createMany({
        data: values.slice(start, start + 2000).map(({ typeId, recordId, fieldId, encoded: value }) => ({
          companyId,
          typeId,
          recordId,
          fieldId,
          ...value,
          jsonValue: value.jsonValue ?? Prisma.DbNull,
          schemaRevision: model.revision,
        })),
      });
    }
    await tx.recordAssignment.createMany({
      data: data.assignments
        .filter((assignment) => rewrittenKeys.has(`${assignment.typeId}:${assignment.recordId}`))
        .map((assignment) => ({ companyId, ...assignment })),
      skipDuplicates: true,
    });

    for (const relationId of new Set(staleLinks.map((link) => link.relationId))) {
      await tx.recordLink.deleteMany({
        where: {
          companyId,
          relationId,
          id: { in: staleLinks.filter((link) => link.relationId === relationId).map((link) => link.id) },
        },
      });
    }
    if (missingLinks.length)
      await tx.recordLink.createMany({ data: missingLinks.map((link) => ({ companyId, ...link })) });
    if (identitiesChanged) {
      await tx.recordIdentity.deleteMany({ where: { companyId, id: { startsWith: `${SOLUTION_IDENTITY_PREFIX}-` } } });
      await tx.recordIdentity.createMany({
        data: data.identities.map(({ id, provider, channelClass, value, messagingId, displayName, profileUrl }) => ({
          companyId,
          id,
          provider,
          channelClass,
          value,
          messagingId,
          displayName,
          profileUrl,
        })),
      });
      await tx.recordIdentityKey.createMany({
        data: data.identities.flatMap(({ id, channelClass, keys }) =>
          keys.map((value) => ({ companyId, identityId: id, channelClass, value })),
        ),
        skipDuplicates: true,
      });
      await tx.recordIdentityLink.createMany({
        data: data.identities.map(({ id, typeId, recordId }) => ({ companyId, identityId: id, typeId, recordId })),
        skipDuplicates: true,
      });
    }
    return {
      created: created.length,
      updated: updated.length,
      deleted: deleted.length,
      unchanged: data.records.length - created.length - updated.length,
      changed: true,
    };
  }, LONG_TRANSACTION);
}

/**
 * Writes a workspace's wiki pages under its fixture ids and removes retired ones. A guide the team wrote themselves
 * wins over the seeded guide; pages of other workspaces are never moved, so an id collision fails the transaction.
 */
export async function seedSolutionWiki(
  prisma: PrismaClient,
  workspace: SolutionWorkspace,
  pages: readonly SolutionWikiRow[],
  createdAt: Date,
): Promise<void> {
  const { companyId, tag } = workspace;
  await prisma.$transaction(async (tx) => {
    await tx.wikiPage.deleteMany({
      where: { companyId, id: { startsWith: `${SOLUTION_WIKI_GROUP}-${tag}-`, notIn: pages.map(({ id }) => id) } },
    });
    const foreignGuide = await tx.wikiPage.findFirst({
      where: { companyId, kind: "guide", id: { notIn: pages.map(({ id }) => id) } },
      select: { id: true },
    });
    const created = new Date(createdAt.getTime() + (workspace.team ? 0 : DAY));
    const timeline = { createdAt: created, updatedAt: created };
    for (const page of pages) {
      if (page.kind === "guide" && foreignGuide) {
        await tx.wikiPage.deleteMany({ where: { companyId, id: page.id } });
        continue;
      }
      const data = { ...page, companyId, ...timeline };
      const written = await tx.wikiPage.updateMany({ where: { id: page.id, companyId }, data });
      if (written.count === 0) await tx.wikiPage.create({ data });
    }
  }, LONG_TRANSACTION);
}

async function writePresentation(
  prisma: PrismaClient,
  workspace: SolutionWorkspace,
  content: SolutionContent,
  model: RecordModel,
) {
  const { companyId, tag } = workspace;
  const views = buildSolutionViews(workspace, content, model);
  await upsertFixturesById(views, ({ id, state, ...rest }) => {
    const createdAt = new Date(solutionWorkspaceCreatedAt(workspace, content).getTime() + 2 * DAY);
    const data = { companyId, ...rest, ...writeStoredState(state), createdAt, deletedAt: null };
    return prisma.dataView.upsert({ where: { id }, update: data, create: { id, ...data } });
  });
  await prisma.dataView.deleteMany({
    where: { companyId, id: { startsWith: `${SOLUTION_VIEW_GROUP}-${tag}-`, notIn: views.map(({ id }) => id) } },
  });

  const widgetsCreatedAt = new Date(solutionWorkspaceCreatedAt(workspace, content).getTime() + 2 * DAY);
  const widgets = buildSolutionWidgets(workspace, content).map((widget) => ({
    ...widget,
    createdAt: widgetsCreatedAt,
    updatedAt: widgetsCreatedAt,
  }));
  await upsertFixturesById(widgets, (widget) =>
    prisma.widget.upsert({
      where: { id: widget.id },
      update: {
        ...widget,
        measure: widget.measure ?? Prisma.DbNull,
        activityQuery: widget.activityQuery ?? Prisma.DbNull,
        calendarQuery: widget.calendarQuery ?? Prisma.DbNull,
        mapQuery: widget.mapQuery ?? Prisma.DbNull,
      },
      create: widget,
    }),
  );
  await prisma.widget.deleteMany({
    where: { companyId, id: { startsWith: `${SOLUTION_WIDGET_GROUP}-${tag}-`, notIn: widgets.map(({ id }) => id) } },
  });

  const memberIds = workspace.team ? Object.values(TEAM_MEMBER_IDS) : [workspace.memberId];
  await prisma.p13n.deleteMany({ where: { companyId, p13nId: SIDEBAR_P13N_ID, userId: { in: memberIds } } });

  await seedSolutionWiki(
    prisma,
    workspace,
    buildSolutionWiki(workspace, content),
    solutionWorkspaceCreatedAt(workspace, content),
  );
}

const API_KEY_GROUP = "2b000000";

/**
 * Writes the API keys a workspace shows on Max's profile. Their stored key is no hash of any key, so they never
 * authenticate; keys the workspace no longer has are removed.
 */
async function seedSolutionApiKeys(prisma: PrismaClient, workspace: SolutionWorkspace, content: SolutionContent) {
  const { companyId, tag } = workspace;
  const keys = (content.apiKeys ?? []).map((spec, index) => {
    const id = workspaceFixtureId(API_KEY_GROUP, tag, index + 1);
    const createdAt = storyMoment(spec.createdDaysAgo);
    return {
      id,
      name: spec.name,
      start: `cm_${tag}`,
      prefix: "cm_",
      key: `display-only-${id}`,
      referenceId: TEAM_MEMBER_IDS.maxBergmann,
      configId: "default",
      enabled: true,
      rateLimitEnabled: false,
      requestCount: 0,
      createdAt,
      updatedAt: createdAt,
      companyId,
    } satisfies Prisma.ApikeyUncheckedCreateInput;
  });
  for (const key of keys) await prisma.apikey.upsert({ where: { id: key.id }, update: key, create: key });
  await prisma.apikey.deleteMany({
    where: { companyId, id: { startsWith: `${API_KEY_GROUP}-${tag}-`, notIn: keys.map(({ id }) => id) } },
  });
}

/**
 * Seeds one demo workspace from its solution content: the shell (company, admin, membership, subscription), the
 * record model, records with links, owners, identities, calculations and history, then views, the dashboard, the
 * default sidebar, the wiki and the conversations. Every step is idempotent, so a repeated run changes nothing.
 */
export async function seedSolutionWorkspace(
  context: SeedContext,
  workspace: SolutionWorkspace,
  content: SolutionContent,
  proposed: RecordModel,
): Promise<SolutionSeedCounts> {
  const started = Date.now();
  const { prisma } = context;
  const { companyId } = workspace;
  await seedWorkspaceShell(context, workspace, content);

  const model = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${companyId}, 0))`;
    return initializeRecordModel(tx, companyId, proposed);
  }, LONG_TRANSACTION);
  if (!isDeepStrictEqual(RecordModelSchema.parse(model), proposed))
    throw new Error(`${workspace.slug}: the stored record model differs from the solution`);

  const data = buildSolutionRecordData(workspace, content, model);
  data.values.push(...solutionFileValues(workspace, content, data));
  const counts = await writeRecords(prisma, workspace, content, model, data);
  await seedSolutionFiles(prisma, workspace, content, data);
  const events = await prisma.eventLog.count({
    where: { companyId, id: { startsWith: `${SOLUTION_RECORD_EVENT_PREFIX}-` } },
  });
  if (counts.changed || events !== data.history.length) {
    await calculateSyntheticRecords(prisma, companyId);
    await writeSyntheticRecordHistory(prisma, companyId, model, data.history, SOLUTION_RECORD_EVENT_PREFIX);
  }

  await writePresentation(prisma, workspace, content, model);
  const messaging = buildSolutionMessaging(workspace, content, data);
  if (messaging) await seedWorkspaceMessaging(prisma, messaging);
  else {
    await prisma.connectedAccount.deleteMany({
      where: { companyId, id: { startsWith: `16000000-${workspace.tag}-` } },
    });
  }
  await seedWebhooks(
    prisma,
    { companyId, tag: workspace.tag, ownerUserId: workspace.memberId },
    content.webhooks ?? [],
  );
  await seedSolutionRoutines(prisma, workspace, content, data);
  await seedSolutionApiKeys(prisma, workspace, content);
  await seedSolutionPlanner(prisma, workspace, content);
  await seedSolutionTrash(prisma, workspace, content);
  await seedSolutionMateChats(prisma, workspace, content);

  return {
    slug: workspace.slug,
    created: counts.created,
    updated: counts.updated,
    deleted: counts.deleted,
    unchanged: counts.unchanged,
    durationMs: Date.now() - started,
  };
}
