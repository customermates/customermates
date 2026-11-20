"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppCardHeader } from "@/components/card/app-card-header";
import { CenteredCardPage } from "@/components/shared/centered-card-page";
import { Button } from "@/components/ui/button";

type Details = { kindLabel: string; maskedEmail: string; workspaceName: string };

export type TurnOffNotificationEmailsState =
  | ({ status: "pending"; token: string } & Details)
  | ({ status: "off"; settingsHref: string } & Details)
  | { status: "expired" }
  | { status: "invalid" };

type Props = { state: TurnOffNotificationEmailsState };

type Translate = ReturnType<typeof useTranslations>;

function copyOf(t: Translate, state: TurnOffNotificationEmailsState): { title: string; body: string } {
  switch (state.status) {
    case "pending":
      return {
        title: t("Notifications.turnOff.title"),
        body: t("Notifications.turnOff.body", {
          kind: state.kindLabel,
          email: state.maskedEmail,
          workspace: state.workspaceName,
        }),
      };
    case "off":
      return {
        title: t("Notifications.turnOff.doneTitle"),
        body: t("Notifications.turnOff.doneBody", {
          kind: state.kindLabel,
          email: state.maskedEmail,
          workspace: state.workspaceName,
        }),
      };
    case "expired":
      return { title: t("Notifications.turnOff.expiredTitle"), body: t("Notifications.turnOff.expiredBody") };
    case "invalid":
      return { title: t("Notifications.turnOff.invalidTitle"), body: t("Notifications.turnOff.invalidBody") };
  }
}

export function TurnOffNotificationEmailsView({ state }: Props) {
  const t = useTranslations();
  const copy = copyOf(t, state);

  return (
    <CenteredCardPage>
      <AppCard className="max-w-md" data-turn-off-state={state.status}>
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

          <h1 className="text-x-2xl mt-4">{copy.title}</h1>

          {state.status === "pending" || state.status === "off" ? (
            <span className="text-x-sm text-subdued">{state.kindLabel}</span>
          ) : null}
        </AppCardHeader>

        <AppCardBody>
          <p className="text-x-sm text-center">{copy.body}</p>
        </AppCardBody>

        {state.status === "pending" ? (
          <AppCardFooter className="flex-col">
            <form action="/api/notifications/unsubscribe" className="w-full" method="post">
              <input name="token" type="hidden" value={state.token} />

              <Button className="w-full" type="submit">
                {t("Notifications.turnOff.confirm")}
              </Button>
            </form>
          </AppCardFooter>
        ) : null}

        {state.status === "off" ? (
          <AppCardFooter className="flex-col">
            <Button asChild className="w-full" variant="secondary">
              <a href={state.settingsHref}>{t("Notifications.turnOff.openSettings")}</a>
            </Button>
          </AppCardFooter>
        ) : null}
      </AppCard>
    </CenteredCardPage>
  );
}
