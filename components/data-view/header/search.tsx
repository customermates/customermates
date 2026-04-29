"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { Search, XIcon } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
  placeholder?: string;
  className?: string;
};

export const DataViewSearch = observer(function DataViewSearch<E extends HasId>({
  store,
  placeholder = "Search",
  className,
}: Props<E>) {
  const [value, setValue] = useState(store.searchTerm ?? "");
  const [expandedMobile, setExpandedMobile] = useState(Boolean(store.searchTerm));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(store.searchTerm ?? "");
  }, [store.searchTerm]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if ((store.searchTerm ?? "") !== value) store.setQueryOptions({ searchTerm: value });
    }, 300);

    return () => window.clearTimeout(handle);
  }, [value, store]);

  function handleExpand() {
    setExpandedMobile(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function handleCollapse() {
    setValue("");
    setExpandedMobile(false);
  }

  return (
    <div className={cn("flex items-center", className)}>
      {!expandedMobile && (
        <Button
          aria-label={placeholder}
          className="lg:hidden size-8 relative"
          size="icon-sm"
          type="button"
          variant="outline"
          onClick={handleExpand}
        >
          <Search className="size-3.5" />

          {value && <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />}
        </Button>
      )}

      <div className={cn("relative", "lg:block lg:w-56 xl:w-64", expandedMobile ? "block w-full min-w-36" : "hidden")}>
        <Search
          className={cn(
            "pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 size-3.5",
            value ? "text-primary" : "text-muted-foreground",
          )}
        />

        <Input
          ref={inputRef}
          className={cn("h-8 pl-7.5 text-sm", expandedMobile && "pr-7.5 md:pr-2", value && "border-primary")}
          placeholder={placeholder}
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />

        {expandedMobile && (
          <button
            aria-label="Collapse search"
            className="md:hidden absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center rounded-sm p-1 text-muted-foreground hover:text-foreground"
            type="button"
            onClick={handleCollapse}
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
});
