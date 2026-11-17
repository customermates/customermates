import type { z } from "zod";

export type ComposeModelCall<T> = {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
};

export type ComposeModelOutcome<T> = { ok: true; value: T } | { ok: false; reason: "credits" | "unavailable" };

export abstract class ComposeModelCaller {
  abstract call<T>(call: ComposeModelCall<T>): Promise<ComposeModelOutcome<T>>;
}
