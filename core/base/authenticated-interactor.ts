import type { Validated } from "@/core/validation/validation.utils";

import { UserAccessor } from "./user-accessor";

/**
 * Base class for interactors that run inside a tenant context.
 *
 * Pair with the `@TenantInteractor` decorator: the decorator establishes the
 * tenant context (authenticated user, permissions); this base class exposes
 * `this.user`, `this.companyId`, `this.userId` to the invoke body via
 * `UserAccessor`.
 *
 * Do NOT extend this from `@SystemInteractor`-decorated classes — they run
 * inside `runWithoutTenant`, so `this.user` would throw. System interactors
 * should be plain classes (no base) since they don't have a tenant user.
 */
export abstract class AuthenticatedInteractor<TInput, TOutput> extends UserAccessor {
  abstract invoke(data: TInput): Validated<TOutput>;
}
