import { type AuditLogDto } from "@/features/audit-log/audit-log.dto";
import { BaseGetRepo } from "@/core/base/base-get.repo";

export abstract class GetAuditLogsRepo extends BaseGetRepo<AuditLogDto> {}
