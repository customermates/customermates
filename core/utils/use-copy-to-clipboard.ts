import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { toast } from "sonner";

import { copyToClipboard } from "./clipboard";

export function useCopyToClipboard() {
  const t = useTranslations();

  return useCallback(
    async (value: string): Promise<boolean> => {
      const ok = await copyToClipboard(value);

      if (ok) toast.success(t("Common.notifications.copiedToClipboard", { value }));
      else toast.error(t("Common.notifications.copyFailed"));

      return ok;
    },
    [t],
  );
}
