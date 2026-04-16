import type { z } from "zod";

/**
 * Validates and strips unknown fields from the interactor's return value.
 * Prevents data leakage by ensuring only declared DTO fields are returned.
 * Automatically handles both single items and arrays.
 *
 * Must be placed BELOW @Validate (runs after the method, not before).
 */
export function ValidateOutput<T>(schema: z.ZodSchema<T>) {
  return function (_: unknown, __: string | symbol, descriptor: PropertyDescriptor) {
    const original = descriptor.value;

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      const result = await original.apply(this, args);

      if (!result?.ok || result.data === undefined || result.data === null) return result;

      result.data = Array.isArray(result.data)
        ? result.data.map((item: unknown) => schema.parse(item))
        : schema.parse(result.data);

      return result;
    };
  };
}
