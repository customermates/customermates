import type { ResolveUserOptionsRepo } from "./resolve-user-options.repo";
import { z } from "zod";
import { Action, Resource } from "@/generated/prisma";
import type { Validated } from "@/core/validation/validation.utils";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";

export const ResolveUserOptionsSchema = z.object({ ids: z.array(z.uuid()).max(100) }).strict();
export type ResolveUserOptionsInput = z.infer<typeof ResolveUserOptionsSchema>;
export type UserOption = { id: string; firstName: string; lastName: string; avatarUrl: string | null };

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.users, action: Action.readAll },
    { resource: Resource.users, action: Action.readOwn },
  ],
  condition: "OR",
})
export class ResolveUserOptionsInteractor extends AuthenticatedInteractor<
  ResolveUserOptionsInput,
  { users: UserOption[] }
> {
  constructor(private repo: ResolveUserOptionsRepo) {
    super();
  }

  @Validate(ResolveUserOptionsSchema)
  async invoke(input: ResolveUserOptionsInput): Validated<{ users: UserOption[] }> {
    return runInTransaction(
      async () => ({ ok: true as const, data: { users: await this.repo.resolveUserOptions(input.ids) } }),
      { readOnly: true },
    );
  }
}
