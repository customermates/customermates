import type { z } from "zod";

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
