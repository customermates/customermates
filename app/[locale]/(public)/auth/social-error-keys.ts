export const SOCIAL_ERROR_FALLBACK_KEY = "generic";

export const SOCIAL_ERROR_KEYS: Record<string, string> = {
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

export const socialErrorMessageKeys = (): string[] =>
  [...new Set([...Object.values(SOCIAL_ERROR_KEYS), SOCIAL_ERROR_FALLBACK_KEY])]
    .sort()
    .map((key) => `AuthSocialErrors.${key}`);
