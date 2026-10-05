import { type UserDto } from "../user.schema";
import { BaseGetRepo } from "@/core/base/base-get.repo";

export abstract class GetUsersRepo extends BaseGetRepo<UserDto> {}
