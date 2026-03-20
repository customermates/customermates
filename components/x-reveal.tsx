"use client";

import type { ReactNode } from "react";

import { AnimatePresence, motion } from "framer-motion";

type Props = {
  children: ReactNode;
  duration?: number;
  show: boolean;
};

export function XReveal({ children, duration = 0.25, show }: Props) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          initial={{ height: 0, opacity: 0 }}
          transition={{ duration }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
