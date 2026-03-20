import type { ReactNode } from "react";

import { cn } from "@heroui/theme";

type Props = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  withHorizontalPadding?: boolean;
};

export function ShowcaseFrame({ children, className, contentClassName, withHorizontalPadding = true }: Props) {
  return (
    <div className={cn("relative w-full max-w-[1400px] mb-10", withHorizontalPadding && "px-4", className)}>
      <div className="absolute top-0 left-0 w-[96px] h-[96px] sm:w-[128px] sm:h-[128px] md:w-[220px] md:h-[220px] lg:w-[550px] lg:h-[550px] bg-success-500/30 dark:bg-success-500/40 rounded-full blur-[1.25rem] sm:blur-[1.5rem] md:blur-[2.25rem] lg:blur-[80px] opacity-10 dark:opacity-8 sm:opacity-12 sm:dark:opacity-10 md:opacity-18 md:dark:opacity-14 lg:opacity-80 lg:dark:opacity-70 will-change-transform" />

      <div className="hidden sm:block absolute top-16 left-14 lg:top-20 lg:left-20 sm:w-[84px] sm:h-[84px] md:w-[140px] md:h-[140px] lg:w-[400px] lg:h-[400px] bg-success-600/20 dark:bg-success-600/30 rounded-full blur-[1.25rem] sm:blur-[1.5rem] md:blur-[2rem] lg:blur-[70px] sm:opacity-8 sm:dark:opacity-6 md:opacity-12 md:dark:opacity-10 lg:opacity-60 lg:dark:opacity-50 will-change-transform" />

      <div className="absolute bottom-0 right-0 w-[92px] h-[92px] sm:w-[124px] sm:h-[124px] md:w-[210px] md:h-[210px] lg:w-[500px] lg:h-[500px] bg-primary-500/30 dark:bg-primary-500/40 rounded-full blur-[1.25rem] sm:blur-[1.5rem] md:blur-[2.25rem] lg:blur-[80px] opacity-10 dark:opacity-8 sm:opacity-12 sm:dark:opacity-10 md:opacity-18 md:dark:opacity-14 lg:opacity-70 lg:dark:opacity-60 will-change-transform" />

      <div className="hidden sm:block absolute bottom-20 right-8 md:bottom-28 md:right-14 lg:bottom-40 lg:right-20 sm:w-[78px] sm:h-[78px] md:w-[130px] md:h-[130px] lg:w-[350px] lg:h-[350px] bg-primary-600/20 dark:bg-primary-600/30 rounded-full blur-[1.25rem] sm:blur-[1.5rem] md:blur-[2rem] lg:blur-[75px] sm:opacity-8 sm:dark:opacity-6 md:opacity-11 md:dark:opacity-9 lg:opacity-60 lg:dark:opacity-50 will-change-transform" />

      <div className="hidden md:block absolute top-1/4 right-0 md:w-[130px] md:h-[130px] lg:w-[320px] lg:h-[320px] bg-primary-400/30 dark:bg-primary-400/40 rounded-full blur-[2rem] lg:blur-[70px] md:opacity-10 md:dark:opacity-8 lg:opacity-60 lg:dark:opacity-50 will-change-transform" />

      <div className="hidden md:block absolute top-1/3 right-12 lg:right-20 md:w-[105px] md:h-[105px] lg:w-[250px] lg:h-[250px] bg-secondary-500/20 dark:bg-secondary-500/30 rounded-full blur-[1.75rem] lg:blur-[65px] md:opacity-8 md:dark:opacity-6 lg:opacity-50 lg:dark:opacity-40 will-change-transform" />

      <div className="hidden sm:block absolute bottom-1/3 left-0 sm:w-[72px] sm:h-[72px] md:w-[120px] md:h-[120px] lg:w-[320px] lg:h-[320px] bg-success-400/20 dark:bg-success-400/30 rounded-full blur-[1.25rem] sm:blur-[1.5rem] md:blur-[2rem] lg:blur-[70px] sm:opacity-8 sm:dark:opacity-6 md:opacity-12 md:dark:opacity-10 lg:opacity-70 lg:dark:opacity-60 will-change-transform" />

      <div className="hidden sm:block absolute bottom-1/4 left-10 md:left-14 lg:left-20 sm:w-[62px] sm:h-[62px] md:w-[95px] md:h-[95px] lg:w-[240px] lg:h-[240px] bg-secondary-400/15 dark:bg-secondary-400/25 rounded-full blur-[1.25rem] sm:blur-[1.5rem] md:blur-[1.75rem] lg:blur-[65px] sm:opacity-7 sm:dark:opacity-6 md:opacity-10 md:dark:opacity-8 lg:opacity-60 lg:dark:opacity-50 will-change-transform" />

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[170px] h-[170px] sm:w-[220px] sm:h-[220px] md:w-[320px] md:h-[320px] lg:w-[450px] lg:h-[450px] bg-primary-400/20 dark:bg-primary-400/30 rounded-full blur-[2rem] sm:blur-[2.25rem] md:blur-[3rem] lg:blur-[80px] opacity-16 dark:opacity-12 sm:opacity-20 sm:dark:opacity-16 md:opacity-28 md:dark:opacity-22 lg:opacity-60 lg:dark:opacity-50 will-change-transform" />

      <div className="absolute top-1/2 left-1/2 -translate-x-1/3 -translate-y-1/3 w-[130px] h-[130px] sm:w-[180px] sm:h-[180px] md:w-[260px] md:h-[260px] lg:w-[350px] lg:h-[350px] bg-secondary-300/15 dark:bg-secondary-300/20 rounded-full blur-[1.75rem] sm:blur-[2rem] md:blur-[2.75rem] lg:blur-[75px] opacity-12 dark:opacity-10 sm:opacity-16 sm:dark:opacity-13 md:opacity-24 md:dark:opacity-19 lg:opacity-50 lg:dark:opacity-40 will-change-transform" />

      <div
        className={cn(
          "relative rounded-2xl overflow-hidden bg-default-400/10 dark:bg-default-100/5 border-8 shadow-2xl shadow-default-900/20 dark:shadow-success-900/10",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
