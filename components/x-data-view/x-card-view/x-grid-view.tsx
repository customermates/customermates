"use client";

import type { HasId } from "@/core/base/base-data-view.store";

import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";

import { XCard } from "../../x-card/x-card";
import { XCardBody } from "../../x-card/x-card-body";
import { useXDataView } from "../x-data-view-container";

import { XDataCard } from "./x-data-card";

type Props<E extends HasId> = {
  renderCell: (item: E, columnKey: React.Key) => string | number | React.JSX.Element;
  onCardAction?: (item: E) => void;
};

export const XGridView = observer(<E extends HasId>({ renderCell, onCardAction }: Props<E>) => {
  const store = useXDataView<E>();
  const t = useTranslations("Common");

  if (store.items.length === 0) {
    return (
      <XCard>
        <XCardBody>
          <div className="flex items-center justify-center py-12">
            <p className="text-subdued">{t("table.emptyContent")}</p>
          </div>
        </XCardBody>
      </XCard>
    );
  }

  return (
    <div
      className="grid gap-5"
      style={{
        gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
      }}
    >
      {store.items.map((item) => (
        <XDataCard key={item.id} item={item} renderCell={renderCell} onPress={onCardAction} />
      ))}
    </div>
  );
});
