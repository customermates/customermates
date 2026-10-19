import type { AppLocale } from "@/i18n/locale-registry";
import type { SetupModelLabels } from "@/features/workspace-setup/setup-model-compiler";

import { getTranslator } from "@/i18n/get-translator";

export async function setupModelLabels(locale: AppLocale): Promise<SetupModelLabels> {
  const t = await getTranslator(locale);
  return {
    channels: t("Common.table.columns.channels"),
    avatar: t("Common.table.columns.avatarUrl"),
    value: t("WorkspaceSetup.anchors.value"),
    price: t("WorkspaceSetup.anchors.price"),
    lineItem: t("RecordModel.lineItem"),
    lineItems: t("RecordModel.lineItems"),
    quantity: t("RecordModel.lineFields.quantity"),
    pricingMode: t("RecordModel.lineFields.pricingMode"),
    savedPrice: t("RecordModel.lineFields.savedPrice"),
    effectivePrice: t("RecordModel.lineFields.effectivePrice"),
    amount: t("RecordModel.lineFields.amount"),
    livePrice: t("RecordModel.priceModes.live"),
    savedPriceMode: t("RecordModel.priceModes.saved"),
  };
}
