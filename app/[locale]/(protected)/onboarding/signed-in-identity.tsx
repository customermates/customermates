"use client";

import { useTranslations } from "next-intl";

import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/core/utils/cn";

type Props = {
  email: string;
  avatarUrl?: string | null;
  className?: string;
};

export function SignedInIdentity({ email, avatarUrl, className }: Props) {
  const t = useTranslations();
  return (
    <div
      className={cn("flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5", className)}
    >
      <Avatar name={email} size="lg" src={avatarUrl} />

      <div className="flex min-w-0 flex-col">
        <span className="text-xs text-muted-foreground">{t("OnboardingChoice.signedInAs")}</span>

        <span className="truncate text-sm font-medium">{email}</span>
      </div>
    </div>
  );
}
