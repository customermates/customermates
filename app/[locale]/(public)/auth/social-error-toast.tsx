"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

const ERROR_KEYS: Record<string, string> = {
  access_denied: "accessDenied",
  account_already_linked_to_different_user: "accountAlreadyLinkedToDifferentUser",
  account_not_linked: "accountNotLinked",
  "email_doesn't_match": "emailDoesNotMatch",
  email_is_missing: "emailIsMissing",
  email_not_found: "emailNotFound",
  id_is_missing: "idIsMissing",
  internal_server_error: "internalServerError",
  invalid_callback_request: "invalidCallbackRequest",
  invalid_code: "invalidCode",
  invalid_payload: "invalidPayload",
  invalid_profile: "invalidProfile",
  issuer_mismatch: "issuerMismatch",
  issuer_missing: "issuerMissing",
  missing_profile: "missingProfile",
  name_is_missing: "nameIsMissing",
  no_callback_url: "noCallbackUrl",
  no_code: "noCode",
  oauth_code_verification_failed: "oauthCodeVerificationFailed",
  oauth_provider_not_found: "oauthProviderNotFound",
  payload_expired: "payloadExpired",
  signup_disabled: "signupDisabled",
  state_mismatch: "stateMismatch",
  unable_to_create_session: "unableToCreateSession",
  unable_to_create_user: "unableToCreateUser",
  unable_to_get_user_info: "unableToGetUserInfo",
  unable_to_link_account: "unableToLinkAccount",
  user_creation_failed: "userCreationFailed",
  user_info_is_missing: "userInfoIsMissing",
};

export function SocialErrorToast() {
  const t = useTranslations();
  const searchParams = useSearchParams();

  useEffect(() => {
    const error = searchParams.get("error");
    if (error === null) return;

    const key = ERROR_KEYS[error] ?? "generic";
    const timer = setTimeout(() => {
      toast.error(t(`AuthSocialErrors.${key}`));
    }, 0);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("error");
    const query = params.toString();
    const path = window.location.pathname;
    window.history.replaceState(null, "", query ? `${path}?${query}` : path);

    return () => clearTimeout(timer);
  }, [searchParams, t]);

  return null;
}
