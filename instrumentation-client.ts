import { captureException } from "@/core/observability/browser";
import { errorReportingEnabled } from "@/core/errors/reporting-provider";
import { installRandomUuidFallback } from "@/core/browser/random-uuid-fallback";
import { BOT_PROTECTED_ROUTES } from "@/core/security/bot-protected-routes";
import { initBotId } from "botid/client/core";

installRandomUuidFallback();

if (process.env.NEXT_PUBLIC_BOT_PROTECTION === "botid" && typeof window !== "undefined")
  initBotId({ protect: BOT_PROTECTED_ROUTES });

if (errorReportingEnabled() && typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    captureException(event.error ?? event.message, {
      frames:
        !event.error && event.filename
          ? [{ file: event.filename, line: event.lineno, column: event.colno }]
          : undefined,
    });
  });
  window.addEventListener("unhandledrejection", (event) => captureException(event.reason));
}
