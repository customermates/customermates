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

function useApplicationErrorHandler(): (error: unknown) => void {
  const t = useTranslations();

  return useCallback(
    (error: unknown) => {
      if (isNoise(error)) return;
      if (isDemoEnvironment()) {
        toast.warning(
          t.rich("ErrorCard.demoModeError", {
            link: (chunks) => (
              <AppLink external className="text-current underline" href="https://customermates.com/auth/signin">
                {chunks}
              </AppLink>
            ),
          }),
        );
        return;
      }
      toast.error(t("ErrorCard.unexpectedError"));
    },
    [t],
  );
}

export function UnexpectedErrorToaster() {
  const handleApplicationError = useApplicationErrorHandler();

  useEffect(() => {
    let navigatingAway = false;
    const markNavigating = () => {
      navigatingAway = true;
    };
    const clearNavigating = () => {
      navigatingAway = false;
    };

    function handlePromise(e: PromiseRejectionEvent) {
      if (navigatingAway) return;
      handleApplicationError(e.reason);
    }

    function handleErrorEvent(e: ErrorEvent) {
      if (navigatingAway) return;
      handleApplicationError(e.error || e.message);
    }

    window.addEventListener("unhandledrejection", handlePromise);
    window.addEventListener("error", handleErrorEvent);
    window.addEventListener("beforeunload", markNavigating);
    window.addEventListener("pagehide", markNavigating);
    window.addEventListener("pageshow", clearNavigating);

    return () => {
      window.removeEventListener("unhandledrejection", handlePromise);
      window.removeEventListener("error", handleErrorEvent);
      window.removeEventListener("beforeunload", markNavigating);
      window.removeEventListener("pagehide", markNavigating);
      window.removeEventListener("pageshow", clearNavigating);
    };
  }, [handleApplicationError]);

  return null;
}
