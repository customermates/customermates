import type { MemberDto } from "../user.schema";

export abstract class GetUserByIdRepo {
  abstract getUserById(id: string): Promise<MemberDto | null>;
}
