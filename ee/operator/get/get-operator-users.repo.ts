import type { OperatorUserRowDto } from "../operator-lists.schema";
import { BaseGetRepo } from "@/core/base/base-get.repo";

export abstract class GetOperatorUsersRepo extends BaseGetRepo<OperatorUserRowDto> {}
