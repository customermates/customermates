import type { OperatorWorkspaceRowDto } from "../operator-lists.schema";
import { BaseGetRepo } from "@/core/base/base-get.repo";

export abstract class GetOperatorWorkspacesRepo extends BaseGetRepo<OperatorWorkspaceRowDto> {}
