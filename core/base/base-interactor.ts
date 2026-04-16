import type { Validated } from "@/core/validation/validation.utils";

export abstract class BaseInteractor<TInput, TOutput> {
  abstract invoke(data: TInput): Validated<TOutput>;
}
