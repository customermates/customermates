import { PermissionService } from "@/core/base/permission.service";
import { PrismaMessagingRepo } from "@/ee/messaging/persistence/prisma-messaging.repository";
import { RecordAccessPolicy } from "@/features/records/record-access";
import { PrismaUserRepo } from "@/features/user/prisma-user.repository";
import { createTestRecordRepo } from "@/tests/helpers/record-repository";

export function createTestMessagingRepo(): PrismaMessagingRepo {
  const records = createTestRecordRepo();
  return new PrismaMessagingRepo(
    records,
    new RecordAccessPolicy(
      new PrismaUserRepo(new PermissionService()),
      records,
    ),
  );
}
