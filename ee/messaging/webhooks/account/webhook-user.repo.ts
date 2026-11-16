import type { TenantUser } from "@/features/user/user.schema";

export abstract class WebhookUserRepo {
  abstract findUserByIdOrThrowUnscoped(userId: string): Promise<TenantUser>;
}
