"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppCardHeader } from "@/components/card/app-card-header";
import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { Button } from "@/components/ui/button";

type Props = { kindLabel: string; token: string };

export function TurnOffNotificationEmailsView({ kindLabel, token }: Props) {
  const t = useTranslations();

  return (
    <CenteredCardPage>
      <AppCard className="max-w-md">
        <AppCardHeader className="text-center flex-col gap-2">
          <Image
            alt=""
            className="inline-block rounded-lg object-contain select-none dark:hidden"
            height={48}
            src="/images/light/customermates-square.svg"
            width={48}
          />

          <Image
            alt=""
            className="hidden rounded-lg object-contain select-none dark:inline-block"
            height={48}
            src="/images/dark/customermates-square.svg"
            width={48}
          />

          <h1 className="text-x-2xl mt-4">{t("Notifications.turnOff.title")}</h1>

          <span className="text-x-sm text-subdued">{kindLabel}</span>
        </AppCardHeader>

        <AppCardBody>
          <p className="text-x-sm text-center">{t("Notifications.turnOff.body", { kind: kindLabel })}</p>
        </AppCardBody>

        <AppCardFooter className="flex-col">
          <form action="/api/notifications/unsubscribe" className="w-full" method="post">
            <input name="token" type="hidden" value={token} />

            <Button className="w-full" type="submit">
              {t("Notifications.turnOff.confirm")}
            </Button>
          </form>
        </AppCardFooter>
      </AppCard>
    </CenteredCardPage>
  );
}
