import { z } from "zod";

export function isCustomField(field: string): boolean {
  return z.uuid().safeParse(field).success;
}
