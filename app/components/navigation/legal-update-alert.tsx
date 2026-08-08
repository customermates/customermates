"use client";

import type { LegalUpdateStatus } from "@/features/legal/get-legal-status.interactor";

import { AlertCircle, ArrowRight, Info } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/core/utils/cn";
import { IntlLink } from "@/i18n/navigation";

type Props = {
  status: LegalUpdateStatus;
  onNavigate: () => void;
};

export function LegalUpdateAlert({ status, onNavigate }: Props) {
  const t = useTranslations();
  const format = useFormatter();
  const effectiveAt = status.contractNoticeSent && !status.contractAccepted ? status.effectiveAt : null;
  const formattedEffectiveAt = effectiveAt
    ? format.dateTime(new Date(effectiveAt), {
        dateStyle: "medium",
        timeZone: "UTC",
      })
    : null;
  const contractModel = formattedEffectiveAt
    ? {
        title: t("LegalUpdateAlert.contractTitle"),
        action: t("LegalUpdateAlert.contractReview"),
        description: status.isSystemAdministrator
          ? t("LegalUpdateAlert.adminDescription", {
              date: formattedEffectiveAt,
            })
          : t("LegalUpdateAlert.memberDescription", {
              date: formattedEffectiveAt,
            }),
      }
    : null;
  const model =
    contractModel ??
    (status.informationNoticeVisible
      ? {
          title: t("LegalUpdateAlert.informationTitle"),
          action: t("LegalUpdateAlert.informationReview"),
          description: t("LegalUpdateAlert.informationDescription"),
        }
      : null);

  if (!model) return null;

  const hasContractUpdate = contractModel !== null;
  const isWarning = hasContractUpdate && status.mustAccept;
  const AlertIcon = isWarning ? AlertCircle : Info;

  return (
    <SidebarGroup className="pb-0" role="status">
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className={cn(
                "h-auto min-h-12 items-start gap-2.5 border px-3 py-2.5 group-data-[collapsible=icon]:items-center",
                isWarning
                  ? "border-warning/30 bg-warning/10 text-warning hover:bg-warning/15 hover:text-warning"
                  : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
              )}
              tooltip={model.title}
            >
              <IntlLink
                aria-label={`${model.title}: ${model.description} ${model.action}`}
                href="/legal-update"
                onClick={onNavigate}
              >
                <AlertIcon className="mt-0.5 shrink-0 group-data-[collapsible=icon]:mt-0" />

                <span className="flex min-w-0 flex-1 flex-col gap-1 whitespace-normal group-data-[collapsible=icon]:hidden">
                  <span className="text-xs font-semibold leading-4 whitespace-normal">{model.title}</span>

                  <span className="text-[11px] leading-4 whitespace-normal opacity-90">{model.description}</span>

                  <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium">
                    {model.action}

                    <ArrowRight className="size-3" />
                  </span>
                </span>
              </IntlLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
