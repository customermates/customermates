"use client";

import type { WikiPageListResult } from "@/features/wiki/wiki.schema";

import { useEffect, useState } from "react";

import { reportApplicationError } from "@/core/errors/report-application-error";
import { useDebouncedValue } from "@/core/utils/use-debounced-value";

import { listWikiPagesAction, searchWikiPagesAction } from "../actions";

export function useWikiPages(initial: WikiPageListResult, loadInitial = false) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(initial.page);
  const [result, setResult] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const debouncedQuery = useDebouncedValue(query.trim());

  useEffect(() => {
    if (query.trim() !== debouncedQuery) return;
    if (!loadInitial && !debouncedQuery && page === initial.page && retry === 0) {
      setResult(initial);
      setFailed(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFailed(false);
    const request = debouncedQuery
      ? searchWikiPagesAction({ query: debouncedQuery, page, pageSize: 25 })
      : listWikiPagesAction({ page, pageSize: 25 });

    void request
      .then((response) => {
        if (cancelled) return;
        if (response.ok) setResult(response.data);
        else setFailed(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        reportApplicationError(error);
        setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, initial, loadInitial, page, query, retry]);

  return {
    result,
    query,
    loading: loading || query.trim() !== debouncedQuery,
    failed,
    page,
    setPage,
    search: (value: string) => {
      setQuery(value);
      setPage(1);
    },
    retry: () => setRetry((value) => value + 1),
  };
}
