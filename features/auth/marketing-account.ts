import type { MarketingAccount } from "./account-state";
import type { AccountStateResolution } from "./route-guard.service";

export function marketingAccountOf({
  state,
  sessionUser,
  user,
}: Pick<AccountStateResolution, "sessionUser" | "state" | "user">): MarketingAccount {
  if (state === "unauthenticated" || !sessionUser) return { profile: null, state };

  const name = user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() : (sessionUser.name ?? "").trim();
  return {
    profile: {
      avatarUrl: user?.avatarUrl ?? sessionUser.image ?? null,
      email: user?.email ?? sessionUser.email,
      name,
    },
    state,
  };
}
