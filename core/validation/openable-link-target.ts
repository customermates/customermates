import { zx } from "@/core/validation/validation.utils";

export function openableLinkTarget(value: string): string | null {
  const parsed = zx.secureUrl().safeParse(value);
  return parsed.success ? parsed.data : null;
}
