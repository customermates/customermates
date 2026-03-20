import type { z } from "zod";

export function Enforce<T>(schema: z.ZodSchema<T>) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = function (data: unknown) {
      const res = schema.parse(data === undefined || data === null ? {} : data);

      return originalMethod.apply(this, [res]);
    };
  };
}
