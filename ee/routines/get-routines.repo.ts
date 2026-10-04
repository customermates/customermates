import { type RoutineDto } from "./routine.schema";
import { BaseGetRepo } from "@/core/base/base-get.repo";

export abstract class GetRoutinesRepo extends BaseGetRepo<RoutineDto> {}
