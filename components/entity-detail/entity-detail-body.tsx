"use client";

import type { ReactNode } from "react";
import type { BaseFormStore } from "@/core/base/base-form.store";
import type {
  BaseCustomColumnEntityModalStore,
  EntityDto,
  FormEntityDto,
} from "@/core/base/base-custom-column-entity-modal.store";

import type { EntityType } from "@/generated/prisma";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppForm } from "@/components/forms/form-context";
import { Button } from "@/components/ui/button";
import { Editor } from "@/components/editor/editor";
import { ENTITY_URL_SEGMENT } from "@/components/entity-detail/entity-relations";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { useRouter } from "@/i18n/navigation";

type Layout = "drawer" | "page";

type Props<Form extends FormEntityDto, Dto extends EntityDto> = {
  store: BaseCustomColumnEntityModalStore<Form, Dto>;
  entityType: EntityType;
  titleKey: string;
  children: ReactNode;
  layout?: Layout;
};

export const EntityDetailBody = observer(
  <Form extends FormEntityDto, Dto extends EntityDto>({
    store,
    entityType,
    children,
    layout = "drawer",
  }: Props<Form, Dto>) => {
    const t = useTranslations();
    const router = useRouter();
    const { singular } = useEntityTerminology();

    const { form, isLoading, lastCreatedId, canManage, isReadOnly } = store;

    useEffect(() => {
      if (!lastCreatedId) return;
      const id = store.consumeLastCreatedId();
      if (!id) return;
      router.push(`/${ENTITY_URL_SEGMENT[entityType]}/${id}`);
    }, [lastCreatedId, entityType, router, store]);

    function handleNotesChange(data: object) {
      store.onChange("notes", data);
    }

    if (layout === "page") return <div className="flex flex-col gap-4 w-full">{children}</div>;

    return (
      <>
        <AppForm store={store as unknown as BaseFormStore}>
          <AppCard className="rounded-none border-0 bg-transparent shadow-none">
            <AppCardHeader>
              <h2 className="text-x-lg grow">{singular(entityType)}</h2>
            </AppCardHeader>

            <AppCardBody>
              <div className="flex flex-col gap-6">
                {children}

                <div className="flex flex-col gap-2">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">
                    {t("Common.actions.labelNotes")}
                  </span>

                  <Editor data={form.notes} readOnly={isReadOnly} onChange={handleNotesChange} />
                </div>
              </div>
            </AppCardBody>

            {canManage && (
              <AppCardFooter className="border-t">
                <Button
                  disabled={isLoading || !store.hasUnsavedChanges || store.isDisabled}
                  id="drawer-save"
                  type="submit"
                >
                  {t("Common.actions.save")}
                </Button>
              </AppCardFooter>
            )}
          </AppCard>
        </AppForm>
      </>
    );
  },
);
