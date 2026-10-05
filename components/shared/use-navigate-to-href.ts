"use client";

import { useCallback } from "react";

import { useRouter } from "@/i18n/navigation";

export function useNavigateToHref() {
  const router = useRouter();
  return useCallback((href: string) => router.push(href), [router]);
}
