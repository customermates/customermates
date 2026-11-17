"use client";

import type { ConnectionProvider } from "@/features/connections/connection-providers";

import { Blocks } from "lucide-react";
import { useTranslations } from "next-intl";

import { ConnectionScopeLine } from "@/components/connections/connection-scope-line";
import { PageState } from "@/components/page-state/page-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CONNECTION_PROVIDERS } from "@/features/connections/connection-providers";

type Props = { providers?: readonly ConnectionProvider[] };

export function ConnectionAppsTab({ providers = CONNECTION_PROVIDERS }: Props) {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-4" data-connection-tab="apps">
      <ConnectionScopeLine owner="workspace" scope="apps" />

      {providers.length === 0 ? (
        <PageState
          description={t("Connections.apps.emptyBody")}
          icon={Blocks}
          state="empty"
          title={t("Connections.apps.emptyTitle")}
        />
      ) : (
        <section aria-labelledby="connection-providers-title" className="flex flex-col gap-3">
          <h2 className="text-base font-semibold" id="connection-providers-title">
            {t("Connections.apps.providersTitle")}
          </h2>

          <div className="grid gap-3">
            {providers.map((provider) => (
              <Card key={provider.id} data-connection-provider={provider.id}>
                <CardContent className="flex flex-wrap items-center gap-3 p-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="truncate text-sm font-medium">{provider.name}</p>

                    <p className="text-xs text-muted-foreground">
                      {`${t("Connections.apps.enables")}: ${t(provider.enablesKey)}`}
                    </p>
                  </div>

                  {provider.available ? null : (
                    <span className="text-xs text-muted-foreground">{t("Connections.apps.comingSoon")}</span>
                  )}

                  <Button disabled={!provider.available} size="sm" variant="secondary">
                    {t("Connections.apps.connect")}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
