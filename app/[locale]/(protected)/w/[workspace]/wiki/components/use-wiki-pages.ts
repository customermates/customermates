"use client";

import type { WikiPageListResult } from "@/features/wiki/wiki.schema";

import { useEffect, useState } from "react";

import { WikiPagesStore } from "./wiki-pages.store";

export function useWikiPages(initial: WikiPageListResult, loadInitial = false) {
  const [store] = useState(() => new WikiPagesStore(initial));
  useEffect(() => {
    store.bind(initial, loadInitial);
    return () => store.dispose();
  }, [store, initial, loadInitial]);
  return store;
}
