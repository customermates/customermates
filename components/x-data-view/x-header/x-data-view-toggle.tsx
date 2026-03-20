import { RectangleGroupIcon, TableCellsIcon } from "@heroicons/react/24/outline";
import { Button, ButtonGroup } from "@heroui/button";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { XIcon } from "../../x-icon";
import { XTooltip } from "../../x-tooltip";
import { useXDataView } from "../x-data-view-container";

import { ViewMode } from "@/core/base/base-query-builder";

export const XDataViewToggle = observer(() => {
  const store = useXDataView();
  const t = useTranslations("Common");

  const isTableView = store.viewMode === ViewMode.table;

  return (
    <ButtonGroup size="sm" variant="flat">
      <XTooltip content={t("ariaLabels.switchToTableView")}>
        <Button
          isIconOnly
          aria-label={t("ariaLabels.switchToTableView")}
          color={isTableView ? "primary" : "default"}
          onPress={() => {
            store.setViewOptions({ viewMode: ViewMode.table });
          }}
        >
          <XIcon icon={TableCellsIcon} />
        </Button>
      </XTooltip>

      <XTooltip content={t("ariaLabels.switchToCardView")}>
        <Button
          isIconOnly
          aria-label={t("ariaLabels.switchToCardView")}
          color={!isTableView ? "primary" : "default"}
          onPress={() => store.setViewOptions({ viewMode: ViewMode.card })}
        >
          <XIcon icon={RectangleGroupIcon} />
        </Button>
      </XTooltip>
    </ButtonGroup>
  );
});
