"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Link2 } from "lucide-react";

import type { RecordEditorStore } from "./record-editor.store";
import type { RecordRelationshipPath } from "@/features/records/record-relationship-path.schema";

import { RecordRelationshipEditor } from "./record-relationship-editor";
import { EntityDetailDerivation } from "@/components/entity-detail/entity-detail-derivation";
import { configurePathLists } from "@/app/[locale]/(protected)/configure/components/configure-model";
import { withFormulaReferences } from "@/features/records/formula-references";

export const RecordPathRecords = observer(function RecordPathRecords({
  store,
  path,
  targetTypeId,
}: {
  store: RecordEditorStore;
  path: RecordRelationshipPath;
  targetTypeId: string;
}) {
  const t = useTranslations();
  const { model, typeId, canManageSchema, formulaReferences } = store.presentation;
  const lists = configurePathLists(withFormulaReferences(model, formulaReferences), typeId, path.path);
  const derivation = (
    <EntityDetailDerivation
      configureHref={canManageSchema ? `/configure?typeId=${typeId}&tab=relationships` : null}
      icon={Link2}
      label={t("RecordModel.derivation.lookup", { field: path.label })}
    >
      {[t("RecordModel.relationshipPath"), lists.join(" → ")].filter(Boolean).join(" · ")}
    </EntityDetailDerivation>
  );
  return (
    <section aria-label={path.label} className="space-y-1.5">
      <RecordRelationshipEditor endContent={derivation} path={path} store={store} targetTypeId={targetTypeId} />
    </section>
  );
});
