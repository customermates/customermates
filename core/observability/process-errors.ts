import type * as ServerReporter from "./server";

type Reporter = Pick<typeof ServerReporter, "captureException" | "flush">;
const state = globalThis as typeof globalThis & { __customermatesProcessErrors?: () => void };

export function installProcessErrorHandlers(reporter: Reporter): () => void {
  if (state.__customermatesProcessErrors) return state.__customermatesProcessErrors;
  let exiting = false;
  const exitAfterFlush = () => {
    if (exiting) return;
    exiting = true;
    const deadline = setTimeout(() => process.exit(1), 2000);
    void reporter
      .flush(1500)
      .catch(() => false)
      .finally(() => {
        clearTimeout(deadline);
        process.exit(1);
      });
  };
  const capture = (error: unknown, event: string) => {
    try {
      reporter.captureException(error, { tags: { processEvent: event } });
    } catch {
      process.stderr.write("[application-error] process capture failed\n");
    }
  };
  const uncaught = (error: Error) => {
    capture(error, "uncaughtException");
    if (process.listenerCount("uncaughtException") === 1) exitAfterFlush();
  };
  const rejection = (error: unknown) => {
    const name = error && typeof error === "object" && "name" in error ? error.name : undefined;
    if (name !== "AbortError" && name !== "AI_NoOutputGeneratedError") capture(error, "unhandledRejection");
    const options = `${process.env.NODE_OPTIONS ?? ""} ${process.execArgv.join(" ")}`;
    const mode = [...options.matchAll(/--unhandled-rejections(?:=|\s+)([\w-]+)/g)].at(-1)?.[1] ?? "throw";
    if (process.listenerCount("unhandledRejection") === 1) {
      if (["throw", "strict"].includes(mode)) exitAfterFlush();
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
