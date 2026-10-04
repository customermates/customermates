import type { OperatorAuditRowDto } from "../operator-lists.schema";
import { BaseGetRepo } from "@/core/base/base-get.repo";

export abstract class GetOperatorAuditLogsRepo extends BaseGetRepo<OperatorAuditRowDto> {}
