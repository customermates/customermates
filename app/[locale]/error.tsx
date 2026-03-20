"use client";

import { useEffect } from "react";

import { useRouter } from "@/i18n/navigation";

export default function ErrorPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/auth/error");
  }, []);

  return null;
}
