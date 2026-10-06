import type { UserDto } from "../user.schema";

export abstract class GetUserByIdRepo {
  abstract getUserById(id: string): Promise<UserDto | null>;
}
