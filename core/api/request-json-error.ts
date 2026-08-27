import { InvalidJsonBodyError } from "@/core/errors/app-errors";

export function mapRequestJsonError(error: unknown): never {
  if (error instanceof SyntaxError) throw new InvalidJsonBodyError();
  throw error;
}
