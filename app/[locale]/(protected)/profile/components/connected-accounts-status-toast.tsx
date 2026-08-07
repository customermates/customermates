"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

const RESULT_PARAMS = ["account_id", "provider", "state", "status", "error_type", "error_detail", "error_title"];

const ALREADY_EXISTS = {
  title: "ConnectedAccountsCard.alreadyExistsToastTitle",
  description: "ConnectedAccountsCard.alreadyExistsToastDescription",
} as const;
const INVALID_CREDENTIALS = {
  title: "ConnectedAccountsCard.invalidCredentialsToastTitle",
  description: "ConnectedAccountsCard.invalidCredentialsToastDescription",
} as const;
const EXPIRED_LINK = {
  title: "ConnectedAccountsCard.expiredLinkToastTitle",
  description: "ConnectedAccountsCard.expiredLinkToastDescription",
} as const;
const CHECKPOINT = {
  title: "ConnectedAccountsCard.checkpointToastTitle",
  description: "ConnectedAccountsCard.checkpointToastDescription",
} as const;
const DISCONNECTED = {
  title: "ConnectedAccountsCard.disconnectedToastTitle",
  description: "ConnectedAccountsCard.disconnectedToastDescription",
} as const;
const FAILED = {
  title: "ConnectedAccountsCard.failedToastTitle",
  description: "ConnectedAccountsCard.failedToastDescription",
} as const;

function connectErrorKeys(errorType: string | null, errorTitle: string | null) {
  switch (errorType?.split("/").pop()) {
    case "already_exists":
      return ALREADY_EXISTS;
    case "invalid_credentials":
    case "expired_credentials":
    case "missing_credentials":
      return INVALID_CREDENTIALS;
    case "expired_link":
      return EXPIRED_LINK;
    case "checkpoint_error":
    case "invalid_checkpoint_solution":
      return CHECKPOINT;
    case "disconnected_account":
      return DISCONNECTED;
  }

  const title = errorTitle?.toLowerCase() ?? "";
  if (title.includes("already exist")) return ALREADY_EXISTS;
  if (title.includes("expired")) return EXPIRED_LINK;
  if (title.includes("credential") || title.includes("password")) return INVALID_CREDENTIALS;

  return FAILED;
}

export function ConnectedAccountsStatusToast() {
  const t = useTranslations();
  const searchParams = useSearchParams();

  useEffect(() => {
    const connected = searchParams.has("account_id");
    const errorType = searchParams.get("error_type");
    const errorTitle = searchParams.get("error_title");
    if (!connected && errorType === null && errorTitle === null) return;

    const timer = setTimeout(() => {
      if (connected) {
        toast.success(t("ConnectedAccountsCard.connectedToastTitle"), {
          description: t("ConnectedAccountsCard.connectedToastDescription"),
        });
      } else {
        const keys = connectErrorKeys(errorType, errorTitle);
        toast.error(t(keys.title), {
          description: t(keys.description),
        });
      }
    }, 0);

    const params = new URLSearchParams(searchParams.toString());
    RESULT_PARAMS.forEach((key) => params.delete(key));
    const query = params.toString();
    const path = window.location.pathname;
    window.history.replaceState(null, "", query ? `${path}?${query}` : path);

    return () => clearTimeout(timer);
  }, [searchParams, t]);

  return null;
}
