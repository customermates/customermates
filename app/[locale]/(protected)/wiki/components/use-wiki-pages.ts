"use client";

import type { WikiPageListResult, WikiPageSearchResult } from "@/features/wiki/wiki.schema";

import { useEffect, useRef, useState } from "react";

import { reportApplicationError } from "@/core/errors/report-application-error";
import { useDebouncedValue } from "@/core/utils/use-debounced-value";

import { getWikiPagesAction, moveWikiPageAction, searchWikiPagesAction } from "../actions";

export function useWikiPages(initial: WikiPageListResult, loadInitial = false) {
  const movePending = useRef(false);
  const [reordering, setReordering] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(initial.page);
  const [result, setResult] = useState<WikiPageListResult | WikiPageSearchResult>(initial);
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
      : getWikiPagesAction({ page, pageSize: 25 });

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

  async function move(id: string, targetId: string, placement: "before" | "after") {
    if (movePending.current || loading || query.trim() || failed) return null;
    movePending.current = true;
    setReordering(true);
    try {
      const response = await moveWikiPageAction({ id, targetId, placement });
      if (!response.ok) return response;
      setRetry((value) => value + 1);
      return response;
    } catch (error: unknown) {
      reportApplicationError(error);
      return null;
    } finally {
      movePending.current = false;
      setReordering(false);
    }
  }

  return {
    move,
    reordering,
    result,
    hasMore:
      "hasMore" in result && result.hasMore !== undefined ? result.hasMore : page * result.pageSize < result.total,
    totalIsExact: !("totalIsExact" in result) || result.totalIsExact !== false,
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
