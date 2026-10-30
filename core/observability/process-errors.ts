import type * as ServerReporter from "./server";

type Reporter = Pick<typeof ServerReporter, "captureException">;
const state = globalThis as typeof globalThis & { __customermatesProcessErrors?: () => void };

export function installProcessErrorHandlers(reporter: Reporter, exitOnFatal = true): () => void {
  if (state.__customermatesProcessErrors) return state.__customermatesProcessErrors;
  const capture = (error: unknown, event: string) => {
    try {
      reporter.captureException(error, { tags: { processEvent: event } });
    } catch {
      process.stderr.write("[application-error] process capture failed\n");
    }
  };
  const uncaught = (error: Error) => {
    capture(error, "uncaughtException");
    if (exitOnFatal && process.listenerCount("uncaughtException") === 1) process.exit(1);
  };
  const rejection = (error: unknown) => {
    const name = error && typeof error === "object" && "name" in error ? error.name : undefined;
    if (name !== "AbortError" && name !== "AI_NoOutputGeneratedError") capture(error, "unhandledRejection");
    const options = `${process.env.NODE_OPTIONS ?? ""} ${process.execArgv.join(" ")}`;
    const mode = [...options.matchAll(/--unhandled-rejections(?:=|\s+)([\w-]+)/g)].at(-1)?.[1] ?? "throw";
    if (exitOnFatal && process.listenerCount("unhandledRejection") === 1) {
      if (["throw", "strict"].includes(mode)) process.exit(1);
      else if (mode === "warn-with-error-code") process.exitCode = 1;
    }
  };
  process.on("uncaughtException", uncaught);
  process.on("unhandledRejection", rejection);
  const dispose = () => {
    process.off("uncaughtException", uncaught);
    process.off("unhandledRejection", rejection);
    delete state.__customermatesProcessErrors;
  };
  state.__customermatesProcessErrors = dispose;
  return dispose;
}
