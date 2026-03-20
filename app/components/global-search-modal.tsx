"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import {
  BriefcaseIcon,
  BuildingOfficeIcon,
  MagnifyingGlassIcon,
  StarIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@heroui/button";
import { cn } from "@heroui/theme";
import { Spinner } from "@heroui/spinner";

import { useRootStore } from "@/core/stores/root-store.provider";
import { XIcon } from "@/components/x-icon";
import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XForm } from "@/components/x-inputs/x-form";
import { XInput } from "@/components/x-inputs/x-input";
import { XModal } from "@/components/x-modal/x-modal";

export const GlobalSearchModal = observer(() => {
  const t = useTranslations("");
  const { globalSearchModalStore, contactModalStore, organizationModalStore, dealModalStore, serviceModalStore } =
    useRootStore();
  const { isOpen, debouncedSearchTerm, isLoading, results } = globalSearchModalStore;

  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => globalSearchModalStore.setWithUnsavedChangesGuard(false), []);

  useEffect(() => {
    if (!isOpen || !inputRef.current || document.activeElement === inputRef.current) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [isOpen, results]);

  useEffect(() => setSelectedIndex(0), [results]);

  const searchResults = useMemo(() => {
    if (!results) return [];

    return results.results.map((item) => {
      let icon: typeof UserGroupIcon;
      let onSelect: () => void;

      switch (item.type) {
        case "contact":
          icon = UserGroupIcon;
          onSelect = () => {
            globalSearchModalStore.close();
            void contactModalStore.loadById(item.id);
          };
          break;
        case "organization":
          icon = BuildingOfficeIcon;
          onSelect = () => {
            globalSearchModalStore.close();
            void organizationModalStore.loadById(item.id);
          };
          break;
        case "deal":
          icon = BriefcaseIcon;
          onSelect = () => {
            globalSearchModalStore.close();
            void dealModalStore.loadById(item.id);
          };
          break;
        case "service":
          icon = StarIcon;
          onSelect = () => {
            globalSearchModalStore.close();
            void serviceModalStore.loadById(item.id);
          };
          break;
      }

      return {
        id: item.id,
        type: item.type,
        label: item.name,
        icon,
        onSelect,
      };
    });
  }, [results]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      globalSearchModalStore.close();
      return;
    }

    if (!searchResults.length) return;

    if (event.key === "ArrowDown" || event.key === "Tab") {
      event.preventDefault();
      setSelectedIndex((prev: number) => (prev + 1) % searchResults.length);
      inputRef.current?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((prev: number) => (prev - 1 + searchResults.length) % searchResults.length);
      inputRef.current?.focus();
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (searchResults[selectedIndex]) searchResults[selectedIndex].onSelect();
    }
  }

  return (
    <>
      <XModal store={globalSearchModalStore}>
        <XForm store={globalSearchModalStore}>
          <XCard>
            <XCardBody>
              <XInput
                ref={inputRef}
                autoFocus
                endContent={isLoading ? <Spinner color="white" size="sm" /> : <XIcon icon={MagnifyingGlassIcon} />}
                id="searchTerm"
                label={null}
                placeholder={t("GlobalSearch.placeholder")}
                onKeyDown={handleKeyDown}
              />

              {!isLoading && results && results.results.length === 0 && debouncedSearchTerm.trim().length >= 1 && (
                <p className="text-subdued text-center py-4">{t("GlobalSearch.noResults")}</p>
              )}

              {!isLoading && searchResults.length > 0 && (
                <div className="flex w-full flex-col space-y-2 items-start">
                  {searchResults.map((item, index) => (
                    <Button
                      key={`${item.type}-${item.id}`}
                      className={cn(
                        "w-full justify-start border-2",
                        selectedIndex === index ? "bg-primary/20 border-primary" : "bg-transparent border-default/20",
                      )}
                      startContent={<XIcon icon={item.icon} />}
                      variant="flat"
                      onPress={item.onSelect}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              )}
            </XCardBody>
          </XCard>
        </XForm>
      </XModal>
    </>
  );
});
