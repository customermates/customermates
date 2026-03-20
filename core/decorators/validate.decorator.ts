import type { z } from "zod";

import { configureZodLocale } from "../validation/zod-error-map-server";

export function Validate<T>(schema: z.ZodSchema<T>) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (data: unknown) {
      const validation = await validate(schema, data);

      if (validation.ok) return originalMethod.apply(this, [validation.data]);

      return validation;
    };
  };
}

async function validate<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): Promise<{ ok: false; error: z.ZodError<T> } | { ok: true; data: T }> {
  await configureZodLocale();

  const res = await schema.safeParseAsync(data);

  if (!res.success) return { ok: false, error: res.error };

  return { ok: true, data: res.data };
}
