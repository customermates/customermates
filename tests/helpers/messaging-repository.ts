import { PermissionService } from "@/core/base/permission.service";
import { PrismaConnectedAccountRepo } from "@/ee/messaging/persistence/prisma-connected-account.repository";
import { PrismaMessagingRepo } from "@/ee/messaging/persistence/prisma-messaging.repository";
import { RecordAccessPolicy } from "@/features/records/record-access";
import { RecordIdentityReader } from "@/features/records/record-identity-reader";
import { PrismaUserRepo } from "@/features/user/prisma-user.repository";
import { createTestRecordRepo } from "@/tests/helpers/record-repository";

export function createTestMessagingRepo(): PrismaMessagingRepo {
  const records = createTestRecordRepo();
  const policy = new RecordAccessPolicy(
    new PrismaUserRepo(new PermissionService()),
    records,
  );
  return new PrismaMessagingRepo(
    records,
    policy,
    new RecordIdentityReader(records, policy),
    new PrismaConnectedAccountRepo(new PermissionService()),
  );
}
