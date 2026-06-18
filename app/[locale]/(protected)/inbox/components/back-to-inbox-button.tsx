"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { useRouter, usePathname } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export function BackToInboxButton() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations();

  function goBack() {
    if (pathname !== "/inbox") {
      router.replace("/inbox", { scroll: false });
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete("threadId");
    router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
  }

  return (
    <Button
      aria-label={t("Inbox.ariaBackToInbox")}
      className="size-8 shrink-0 lg:hidden"
      size="icon-sm"
      type="button"
      variant="ghost"
      onClick={goBack}
    >
      <ArrowLeft className="size-4" />
    </Button>
  );
}
