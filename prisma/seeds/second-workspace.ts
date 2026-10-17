import { createTranslator } from "next-intl";

import type { Prisma } from "@/generated/prisma";

import { SYNTHETIC_SECOND_WORKSPACE_NAME } from "@/core/config/synthetic-seed-user";
import { validateRecordModel } from "@/features/records/record-model-validation";
import { RecordRevisionChangeSchema } from "@/features/records/record-revision.schema";
import { recordJson } from "@/features/records/record-storage";
import { createWorkspaceRecordPreset } from "@/features/records/workspace-record-preset";
import en from "@/i18n/locales/en.json";

import type { SeedContext } from "./context";

import { SEED_IDS } from "./context";
import { reconcileDomainUserId } from "./helpers";
import { SYNTHETIC_SEED_TIMELINE } from "./timeline";

const timeline = SYNTHETIC_SEED_TIMELINE.secondWorkspace;

export const SYNTHETIC_SECOND_WORKSPACE = {
  company: {
    id: SEED_IDS.secondWorkspaceCompany,
    createdByAuthUserId: SEED_IDS.user,
    name: SYNTHETIC_SECOND_WORKSPACE_NAME,
    ...timeline.company,
  },
  role: {
    id: SEED_IDS.secondWorkspaceRole,
    companyId: SEED_IDS.secondWorkspaceCompany,
    description: "Full access to all features and settings",
    isSystemRole: true,
    name: "Admin",
    ...timeline.company,
  },
  member: {
    id: SEED_IDS.maxBergmannSecondWorkspaceUser,
    agentCreditActivatedAt: timeline.owner.createdAt,
    agreeToTerms: true,
    companyId: SEED_IDS.secondWorkspaceCompany,
    isPlatformOperator: false,
    leftAt: null,
    onboardingWizardCompletedAt: new Date(timeline.owner.updatedAt.getTime() + 5 * 60_000),
    roleId: SEED_IDS.secondWorkspaceRole,
    status: "active",
    ...timeline.owner,
  },
  subscription: {
    id: SEED_IDS.secondWorkspaceSubscription,
    agentCreditAnchorAt: timeline.company.createdAt,
    plan: "pro",
    quantity: null,
    status: "active",
  },
} as const;

const translate = createTranslator({ locale: "en", messages: en }) as unknown as (key: string) => string;

async function seedStarterRecordModel(context: SeedContext): Promise<void> {
  const { company, member } = SYNTHETIC_SECOND_WORKSPACE;
  const companyId = company.id;

  await context.prisma.$transaction(
    async (prisma) => {
      if (await prisma.recordSchemaState.findUnique({ where: { companyId } })) return;

      const model = createWorkspaceRecordPreset(companyId, translate);
      if (validateRecordModel(model).issues.length) throw new Error("The workspace record preset is invalid.");

      await prisma.recordTypeDefinition.createMany({
        data: model.types.map((type) => ({
          companyId,
          id: type.id,
          label: type.label,
          pluralLabel: type.pluralLabel,
          archived: type.archived,
          embedded: type.embedded,
          position: type.position,
          definition: recordJson(type),
        })),
      });
      await prisma.recordFieldDefinition.createMany({
        data: model.fields.map((field) => ({
          companyId,
          id: field.id,
          typeId: field.typeId,
          valueType: field.valueType,
          behavior: field.behavior.kind,
          archived: field.archived,
          definition: recordJson(field),
        })),
      });
      await prisma.recordRelationshipDefinition.createMany({
        data: model.relationships.map((relation) => ({
          companyId,
          id: relation.id,
          sourceTypeId: relation.sourceTypeId,
          targetTypeId: relation.targetTypeId,
          archived: relation.archived,
          definition: recordJson(relation),
        })),
      });
      await prisma.recordSchemaState.create({ data: { companyId, revision: model.revision } });
      await prisma.recordSchemaRevision.create({
        data: {
          companyId,
          revision: model.revision,
          actorId: member.id,
          snapshot: recordJson(model),
          change: recordJson(
            RecordRevisionChangeSchema.parse({
              version: 1,
              source: { kind: "initialization" },
              causeId: "workspace-record-preset",
              expectedRevision: 0,
              references: [],
              grants: [],
            }),
          ),
        },
      });
    },
    { timeout: 60_000 },
  );
}

export async function seedSecondWorkspace(context: SeedContext): Promise<void> {
  const { ids, prisma } = context;
  const { company, member, role } = SYNTHETIC_SECOND_WORKSPACE;
  const { id: subscriptionId, ...subscription } = SYNTHETIC_SECOND_WORKSPACE.subscription;

  await prisma.company.upsert({ where: { id: company.id }, update: company, create: company });
  await prisma.userRole.upsert({ where: { id: role.id }, update: role, create: role });

  const profile = await prisma.user.findUniqueOrThrow({
    where: { id: ids.user, companyId: ids.company },
    select: {
      avatarUrl: true,
      country: true,
      displayLanguage: true,
      email: true,
      firstName: true,
      formattingLocale: true,
      lastName: true,
      theme: true,
    },
  });
  const user = { ...profile, ...member } satisfies Prisma.UserUncheckedCreateInput;
  await reconcileDomainUserId(context, user.id, user);
  await prisma.user.upsert({ where: { id: user.id }, update: user, create: user });

  await prisma.subscription.upsert({
    where: { companyId: company.id },
    update: subscription,
    create: { id: subscriptionId, companyId: company.id, ...subscription },
  });

  await seedStarterRecordModel(context);
}
