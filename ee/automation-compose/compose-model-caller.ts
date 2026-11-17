import type { z } from "zod";

export type ComposeModelCall<T> = {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
};

export abstract class ComposeModelCaller {
  abstract call<T>(call: ComposeModelCall<T>): Promise<T | null>;
}
