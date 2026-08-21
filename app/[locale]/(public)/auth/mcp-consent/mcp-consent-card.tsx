"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";

type Props = {
  clientName: string;
  consentCode: string;
  redirectHost: string;
  scopes: string[];
};

export const McpConsentCard = observer(({ clientName, consentCode, redirectHost, scopes }: Props) => {
  const t = useTranslations();
  const { mcpConsentStore, navigationGuard } = useRootStore();

  const decide = async (accept: boolean) => {
    const redirectURI = await mcpConsentStore.decide(consentCode, accept);
    if (!redirectURI) return;

    navigationGuard.tryNavigate(() => {
      window.location.href = redirectURI;
    });
  };

  const scopeLabel = (scope: string): string => {
    switch (scope) {
      case "openid":
        return t("McpConsentCard.scopes.openid");
      case "profile":
        return t("McpConsentCard.scopes.profile");
      case "email":
        return t("McpConsentCard.scopes.email");
      case "offline_access":
        return t("McpConsentCard.scopes.offlineAccess");
      default:
        return scope;
    }
  };

  return (
    <AppCard className="max-w-md">
      <CardHeroHeader
        subtitle={t("McpConsentCard.subtitle", { client: clientName })}
        title={t("McpConsentCard.title")}
      />

      <AppCardBody>
        <p className="text-x-sm">{t("McpConsentCard.body", { client: clientName })}</p>

        {scopes.length > 0 && (
          <ul className="text-x-sm text-subdued list-disc space-y-1 pl-5">
            {scopes.map((scope) => (
              <li key={scope}>{scopeLabel(scope)}</li>
            ))}
          </ul>
        )}

        <p className="text-x-xs text-subdued">{t("McpConsentCard.destination", { host: redirectHost })}</p>
      </AppCardBody>

      <AppCardFooter>
        <Button
          disabled={mcpConsentStore.isSubmitting}
          variant="secondary"
          onClick={() => runUserAction(() => decide(false))}
        >
          {t("McpConsentCard.deny")}
        </Button>

        <Button disabled={mcpConsentStore.isSubmitting} onClick={() => runUserAction(() => decide(true))}>
          {t("McpConsentCard.approve")}
        </Button>
      </AppCardFooter>
    </AppCard>
  );
});
