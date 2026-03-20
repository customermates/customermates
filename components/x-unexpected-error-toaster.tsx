"use client";

import { useEffect } from "react";
import { addToast } from "@heroui/toast";
import { useTranslations } from "next-intl";

import { XLink } from "@/components/x-link";

function isDemoEnvironment(): boolean {
  if (typeof window === "undefined") return false;

  return window.location.hostname.includes("demo");
}

export function XUnexpectedErrorToaster() {
  const t = useTranslations("ErrorCard");

  function showDemoModeError() {
    addToast({
      color: "warning",
      description: t.rich("demoModeError", {
        link: (chunks) => (
          <XLink className="underline" color="warning" href={`https://customermates.com/auth/signin`}>
            {chunks}
          </XLink>
        ),
      }),
    });
  }

  function showUnexpectedError() {
    addToast({ description: t("unexpectedError"), color: "danger" });
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

  function isFromApplication(error: unknown): boolean {
    if (!error) return false;
    if (containsString(error, "NEXT_REDIRECT")) return false;
    return containsString(error, "The specific message is omitted in production builds");
  }

  useEffect(() => {
    function handleError(error: unknown) {
      if (!isFromApplication(error)) return;
      if (isDemoEnvironment()) {
        showDemoModeError();
        return;
      }
      showUnexpectedError();
    }

    function handlePromise(e: PromiseRejectionEvent) {
      handleError(e.reason);
    }

    function handleErrorEvent(e: ErrorEvent) {
      handleError(e.error || e.message);
    }

    window.addEventListener("unhandledrejection", handlePromise);
    window.addEventListener("error", handleErrorEvent);

    return () => {
      window.removeEventListener("unhandledrejection", handlePromise);
      window.removeEventListener("error", handleErrorEvent);
    };
  }, [t]);

  return null;
}
