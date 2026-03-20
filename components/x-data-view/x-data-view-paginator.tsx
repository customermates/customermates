"use client";

import { Pagination } from "@heroui/pagination";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";

import { XCardFooter } from "../x-card/x-card-footer";
import { XSelect } from "../x-inputs/x-select";
import { XSelectItem } from "../x-inputs/x-select-item";

import { useXDataView } from "./x-data-view-container";

import { ViewMode } from "@/core/base/base-query-builder";

export const XDataViewPaginator = observer(() => {
  const store = useXDataView();
  const t = useTranslations("Common");
  const isCardView = store.viewMode === ViewMode.card;
  const totalItems = store.pagination?.total || 0;
  const currentPage = store.pagination?.page ?? 1;
  const pageSize = store.pagination?.pageSize ?? 25;
  const totalPages = store.pagination?.totalPages || Math.ceil(totalItems / pageSize);
  const pageSizeOptions = [5, 10, 25, 100, 1000] as const;

  if (totalItems <= 5) return null;

  function handlePageChange(page: number) {
    store.setQueryOptions({
      pagination: {
        pageSize,
        page,
      },
    });
  }

  function handlePageSizeChange(pageSize: (typeof pageSizeOptions)[number]) {
    store.setQueryOptions({
      pagination: {
        page: 1,
        pageSize,
      },
    });
  }

  const paginatorContent = (
    <div
      className={`flex flex-col xs:flex-row items-center justify-between gap-4 w-full mt-auto ${
        isCardView ? "sticky left-0 bottom-0" : ""
      }`}
    >
      <Pagination
        className={
          totalPages <= 1 ? "invisible" : isCardView ? "bg-background/40 backdrop-blur-xs rounded-full" : undefined
        }
        color="primary"
        page={currentPage}
        size="sm"
        total={totalPages}
        variant="light"
        onChange={handlePageChange}
      />

      <div
        className={`flex gap-2 items-center justify-start ${isCardView ? "bg-background/40 backdrop-blur-xs rounded-full p-2.5 -m-2.5" : ""}`}
      >
        <XSelect
          disallowEmptySelection
          classNames={{ base: "w-36", popoverContent: "w-24" }}
          id="pageSize"
          items={pageSizeOptions.map((value) => ({ key: value.toString() }))}
          labelPlacement="outside-left"
          size="sm"
          value={pageSize.toString()}
          onChange={(e) => handlePageSizeChange(Number(e.target.value) as (typeof pageSizeOptions)[number])}
        >
          {({ key }) =>
            XSelectItem({
              key: key,
              children: key,
            })
          }
        </XSelect>

        <span className="text-x-sm text-subdued">
          {t("table.paginationRange", {
            from: (currentPage - 1) * pageSize + 1,
            to: Math.min(currentPage * pageSize, totalItems),
            total: totalItems,
          })}
        </span>
      </div>
    </div>
  );

  if (isCardView) return paginatorContent;

  return <XCardFooter className="pt-1">{paginatorContent}</XCardFooter>;
});
