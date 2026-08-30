import { Fragment } from "react";

import { AppLink } from "@/components/shared/app-link";
import { hubPageHref, hubPagerModel } from "@/core/seo/hub-pagination";
import { cn } from "@/core/utils/cn";

type Props = {
  basePath: string;
  label: string;
  nextLabel: string;
  page: number;
  pageCount: number;
  previousLabel: string;
};

const pageClassName =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

export function HubPagination({ basePath, label, nextLabel, page, pageCount, previousLabel }: Props) {
  if (pageCount < 2) return null;

  const model = hubPagerModel(page, pageCount);

  return (
    <nav aria-label={label} className="w-full bg-sidebar pb-16 md:pb-24">
      <ul className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-2 px-4">
        {model.previousPage ? (
          <li>
            <AppLink
              appearance="unstyled"
              className={cn(pageClassName, "border-border text-subdued")}
              href={hubPageHref(basePath, model.previousPage)}
              rel="prev"
            >
              {previousLabel}
            </AppLink>
          </li>
        ) : null}

        {model.pageNumbers.map((number, index) => {
          const previousNumber = model.pageNumbers[index - 1];
          return (
            <Fragment key={number}>
              {previousNumber !== undefined && number - previousNumber > 1 ? (
                <li aria-hidden="true" className="px-1 text-subdued">
                  …
                </li>
              ) : null}

              <li>
                {number === page ? (
                  <span
                    aria-current="page"
                    aria-label={String(number)}
                    className={cn(pageClassName, "border-primary font-medium text-primary")}
                  >
                    {number}
                  </span>
                ) : (
                  <AppLink
                    appearance="unstyled"
                    aria-label={String(number)}
                    className={cn(pageClassName, "border-border text-subdued")}
                    href={hubPageHref(basePath, number)}
                  >
                    {number}
                  </AppLink>
                )}
              </li>
            </Fragment>
          );
        })}

        {model.nextPage ? (
          <li>
            <AppLink
              appearance="unstyled"
              className={cn(pageClassName, "border-border text-subdued")}
              href={hubPageHref(basePath, model.nextPage)}
              rel="next"
            >
              {nextLabel}
            </AppLink>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
