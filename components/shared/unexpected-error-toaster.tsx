"use client";

import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { AppLink } from "@/components/shared/app-link";

function isDemoEnvironment(): boolean {
  if (typeof window === "undefined") return false;

  return window.location.hostname.includes("demo");
}

function containsString(error: unknown, searchString: string): boolean {
  if (typeof error === "string") return error.includes(searchString);
  if (error instanceof Error) return error.message.includes(searchString);
  try {
    return JSON.stringify(error).includes(searchString);
  } catch {
    return false;
  }
}

function isNoise(error: unknown): boolean {
  if (!error) return true;
  if (containsString(error, "NEXT_REDIRECT")) return true;
  if (containsString(error, "ResizeObserver loop")) return true;
  return false;
}

export function useApplicationErrorHandler(): (error: unknown) => void {
  const t = useTranslations("ErrorCard");

  return useCallback(
    (error: unknown) => {
      if (isNoise(error)) return;
      if (isDemoEnvironment()) {
        toast.warning(
          t.rich("demoModeError", {
            link: (chunks) => (
              <AppLink external className="text-current underline" href="https://customermates.com/auth/signin">
                {chunks}
              </AppLink>
            ),
          }),
        );
        return;
      }
      toast.error(t("unexpectedError"));
    },
    [t],
  );
}

export function UnexpectedErrorToaster() {
  const handleApplicationError = useApplicationErrorHandler();

  useEffect(() => {
    function handlePromise(e: PromiseRejectionEvent) {
      handleApplicationError(e.reason);
    }

    function handleErrorEvent(e: ErrorEvent) {
      handleApplicationError(e.error || e.message);
    }

    window.addEventListener("unhandledrejection", handlePromise);
    window.addEventListener("error", handleErrorEvent);

    return () => {
      window.removeEventListener("unhandledrejection", handlePromise);
      window.removeEventListener("error", handleErrorEvent);
    };
  }, [handleApplicationError]);

  return null;
}
