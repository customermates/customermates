import type { Validated } from "@/core/validation/validation.utils";

import { UserAccessor } from "./user-accessor";

export abstract class AuthenticatedInteractor<TInput, TOutput> extends UserAccessor {
  abstract invoke(data: TInput): Validated<TOutput>;
}
