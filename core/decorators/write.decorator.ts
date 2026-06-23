import type { z } from "zod";

import type { PrecheckFn } from "@/core/validation/run-precheck";

import { runPrecheck } from "@/core/validation/run-precheck";

import { Validate } from "./validate.decorator";
import { Transaction } from "./transaction.decorator";
import { ValidateOutput } from "./validate-output.decorator";

type TransactionOptions = { timeout?: number; maxWait?: number };

type WritePrecheck<I> = (self: any, data: I, ctx: z.RefinementCtx) => void | Promise<void>;

interface WriteOptions<I, O> {
  input: z.ZodType<I>;
  output?: z.ZodType<O>;
  precheck?: WritePrecheck<I>;
  tx?: TransactionOptions | false;
}

export function Write<I, O>(opts: WriteOptions<I, O>) {
  return function (target: any, key: string, descriptor: PropertyDescriptor) {
    if (opts.tx !== false) Transaction(opts.tx)(target, key, descriptor);
    if (opts.output) ValidateOutput(opts.output)(target, key, descriptor);
    if (opts.precheck) Precheck(opts.precheck)(target, key, descriptor);
    Validate(opts.input)(target, key, descriptor);
  };
}

function Precheck<I>(check: WritePrecheck<I>) {
  return function (_target: any, _key: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value;

    descriptor.value = async function (this: unknown, data: I) {
      const precheck: PrecheckFn<I> = (value, ctx) => check(this, value, ctx);
      const result = await runPrecheck(data, precheck);

      if (!result.ok) return result;

      return original.apply(this, [data]);
    };
  };
}
