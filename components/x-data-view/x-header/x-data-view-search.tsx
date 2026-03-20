import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { motion } from "framer-motion";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { cn } from "@heroui/theme";

import { XIcon } from "../../x-icon";
import { useXDataView } from "../x-data-view-container";

type Props = {
  className?: string;
};

export const XDataViewSearch = observer(({ className }: Props) => {
  const store = useXDataView();
  const t = useTranslations("Common");
  const [local, setLocal] = useState(store.searchTerm ?? "");
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasValue = Boolean(local);
  const shouldShowInput = isExpanded || hasValue;

  useEffect(() => setLocal(store.searchTerm ?? ""), [store.searchTerm]);

  useEffect(() => {
    const timeout = setTimeout(() => store.setQueryOptions({ searchTerm: local }), 300);
    return () => clearTimeout(timeout);
  }, [local]);

  useEffect(() => {
    if (shouldShowInput && inputRef.current) inputRef.current.focus();
  }, [shouldShowInput]);

  return (
    <div className="relative flex">
      <motion.div
        animate={{ opacity: shouldShowInput ? 0 : 1 }}
        className="absolute flex right-0 z-0"
        initial={{ opacity: 1 }}
        transition={{ duration: 0.1 }}
      >
        <Button
          disableRipple
          isIconOnly
          className={cn(`${shouldShowInput ? "pointer-events-none" : "pointer-events-auto"}`, className)}
          size="sm"
          variant="flat"
          onPress={() => setIsExpanded(true)}
        >
          <XIcon icon={MagnifyingGlassIcon} />
        </Button>
      </motion.div>

      <motion.div
        animate={{
          scaleX: shouldShowInput ? 1 : 0,
          opacity: shouldShowInput ? 1 : 0,
          width: shouldShowInput ? "10rem" : "2rem",
        }}
        className={cn(
          "flex origin-right overflow-hidden relative z-10",
          shouldShowInput ? "pointer-events-auto" : "pointer-events-none",
        )}
        initial={{ scaleX: 0, opacity: 0, width: "2rem" }}
        transition={{ duration: 0.1 }}
      >
        <Input
          ref={inputRef}
          isClearable
          className={className}
          placeholder={t("table.search")}
          size="sm"
          startContent={<XIcon icon={MagnifyingGlassIcon} />}
          value={local}
          variant="bordered"
          onBlur={() => {
            if (!hasValue) setIsExpanded(false);
          }}
          onClear={() => {
            setLocal("");
            if (!isExpanded) setIsExpanded(false);
          }}
          onValueChange={setLocal}
        />
      </motion.div>
    </div>
  );
});
