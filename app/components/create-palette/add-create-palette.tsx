"use client";

import type { LucideIcon } from "lucide-react";
import type { CreatePaletteTemplate } from "@/components/create-palette/create-palette";
import type { OnboardingTemplateCard } from "@/features/onboarding-templates/onboarding-template-offer";
import type { TemplateSpec } from "@/core/templates/template-spec.schema";

import {
  Briefcase,
  Building2,
  ChartLine,
  ClipboardList,
  FileText,
  Hammer,
  Handshake,
  HeartHandshake,
  House,
  Inbox,
  LayoutGrid,
  UserSearch,
} from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { CreatePalette } from "@/components/create-palette/create-palette";
import { recordTypeIcon } from "@/components/records/record-type-icon";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useRouter } from "@/i18n/navigation";

import { listLibraryTemplatesAction } from "./actions";
import { CREATE_LIST_HREF } from "./use-open-create-list";

const FAMILY_ICONS: Record<TemplateSpec["family"], LucideIcon> = {
  sales: ChartLine,
  clients: Handshake,
  property: House,
  recruiting: UserSearch,
  "professional-services": Briefcase,
  operations: ClipboardList,
  content: FileText,
  intake: Inbox,
  community: HeartHandshake,
  trades: Hammer,
  investing: Building2,
  custom: LayoutGrid,
};

type TypeRow = CreatePaletteTemplate & { typeId: string };
type LibraryRow = CreatePaletteTemplate & { card: OnboardingTemplateCard };

export const AddCreatePalette = observer(function AddCreatePalette() {
  const t = useTranslations();
  const router = useRouter();
  const { addPickerStore, agentChatEnabled, agentChatStore, recordWorkspaceStore } = useRootStore();
  const navigation = recordWorkspaceStore.navigation;
  const canManageSchema = navigation?.canManageSchema ?? false;
  const mateAvailable = agentChatEnabled && agentChatStore.enabled === true;
  const { isOpen, screen, query, listTemplates } = addPickerStore;
  const listing = isOpen && screen === "list";

  useEffect(() => {
    if (!listing || !mateAvailable || listTemplates !== null) return;
    let active = true;
    listLibraryTemplatesAction()
      .then((cards) => {
        if (active) addPickerStore.setListTemplates(cards);
      })
      .catch(reportApplicationError);
    return () => {
      active = false;
    };
  }, [addPickerStore, listTemplates, listing, mateAvailable]);

  const closeThen = (action: (target: HTMLElement | null, fallback: HTMLElement | null) => void) => {
    const { focusReturnTarget, focusReturnFallback } = addPickerStore;
    addPickerStore.close();
    action(focusReturnTarget, focusReturnFallback);
  };

  const askMate = (prompt: string) =>
    closeThen(() => {
      agentChatStore.openWithDraft(prompt);
      agentChatStore.submitDraft();
    });

  const createBlankList = () => closeThen(() => router.push(CREATE_LIST_HREF));

  if (screen === "list") {
    const templates: LibraryRow[] = mateAvailable
      ? (listTemplates ?? []).map((card) => ({
          id: card.slug,
          card,
          title: card.name,
          description: card.summary,
          icon: FAMILY_ICONS[card.family],
          badge: { label: t("CreatePalette.list.listCount", { count: card.counts.lists }), tone: "outline" },
        }))
      : [];
    return (
      <CreatePalette
        ai={
          mateAvailable
            ? {
                label: t("CreatePalette.list.ai"),
                onSelect: (text) => askMate(t("CreatePalette.list.aiRequest", { text })),
              }
            : null
        }
        blank={{
          label: t("CreatePalette.list.blank"),
          description: t("CreatePalette.list.blankDescription"),
          onSelect: createBlankList,
        }}
        focusReturnFallback={addPickerStore.focusReturnFallback}
        focusReturnTarget={addPickerStore.focusReturnTarget}
        open={isOpen}
        placeholder={mateAvailable ? t("CreatePalette.list.placeholder") : t("CreatePalette.searchPlaceholder")}
        query={query}
        templates={templates}
        templatesHeading={t("CreatePalette.list.libraryHeading")}
        title={t("RecordModel.createList")}
        onClose={addPickerStore.close}
        onQueryChange={addPickerStore.setQuery}
        onTemplate={({ card }) =>
          askMate(t("CreatePalette.list.templateRequest", { name: card.name, summary: card.summary }))
        }
      />
    );
  }

  const types: TypeRow[] = (navigation?.types ?? [])
    .filter((type) => type.canCreate)
    .map((type) => ({
      id: type.id,
      typeId: type.id,
      title: t("NavigationBar.addEntity", { entity: type.label }),
      keywords: [type.label],
      icon: recordTypeIcon(type.icon),
    }));

  return (
    <CreatePalette
      blank={
        canManageSchema
          ? {
              label: t("RecordModel.createList"),
              description: mateAvailable ? t("CreatePalette.add.createListDescription") : undefined,
              onSelect: () => {
                if (mateAvailable) addPickerStore.showList();
                else createBlankList();
              },
            }
          : null
      }
      focusReturnFallback={addPickerStore.focusReturnFallback}
      focusReturnTarget={addPickerStore.focusReturnTarget}
      open={isOpen}
      placeholder={t("CreatePalette.add.placeholder")}
      query={query}
      templates={types}
      templatesHeading={t("CommandPalette.groups.records")}
      title={t("NavigationBar.addPickerTitle")}
      onClose={addPickerStore.close}
      onQueryChange={addPickerStore.setQuery}
      onTemplate={({ typeId }) =>
        closeThen((target, fallback) => recordWorkspaceStore.open({ typeId }, target, fallback))
      }
    />
  );
});
