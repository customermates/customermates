"use client";

import type { OperatorActionErrorCode } from "./operator-action-state";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { operatorErrorKey } from "./operator-action-state";

export function useOperatorErrorToast() {
  const t = useTranslations();

  return (code: OperatorActionErrorCode) => toast.error(t(operatorErrorKey(code)));
}
