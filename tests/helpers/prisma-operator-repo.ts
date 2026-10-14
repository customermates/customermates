import { PermissionService } from "@/core/base/permission.service";
import { PrismaAgentChatRepo } from "@/ee/agent-chat/prisma-agent-chat.repository";
import { PrismaUnipileWebhookRepo } from "@/ee/messaging/persistence/prisma-unipile-webhook.repository";
import type { OperatorWriteOwners } from "@/ee/operator/operator-write-owners";
import { PrismaOperatorRepo } from "@/ee/operator/prisma-operator.repository";
import { PrismaCompanyRepo } from "@/features/company/prisma-company.repository";
import { PrismaUserRepo } from "@/features/user/prisma-user.repository";
import { prismaAgentChatRepoDependencies } from "./prisma-agent-chat-repo";
import { createTestRecordRepo } from "./record-repository";

const authService = async () => {
  const [{ AuthService }, { EmailService }] = await Promise.all([
    import("@/features/auth/auth.service"),
    import("@/features/email/email.service"),
  ]);
  return new AuthService(new EmailService());
};

const identities: OperatorWriteOwners["identities"] = {
  deleteVerificationsForEmails: async (emails) => (await authService()).deleteVerificationsForEmails(emails),
  deleteApiKeysForIdentities: async (identityIds) => (await authService()).deleteApiKeysForIdentities(identityIds),
};

export const createTestOperatorRepo = () =>
  new PrismaOperatorRepo(new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()), {
    users: new PrismaUserRepo(new PermissionService()),
    records: createTestRecordRepo(),
    companies: new PrismaCompanyRepo(),
    identities,
    inboundEvents: new PrismaUnipileWebhookRepo(),
  });
