import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  withGlow?: boolean;
  withHorizontalPadding?: boolean;
};

export function ShowcaseFrame({
  children,
  className,
  contentClassName,
  withGlow = true,
  withHorizontalPadding = true,
}: Props) {
  return (
    <div className={cn("relative mb-10 w-full max-w-[1400px]", withHorizontalPadding && "px-4", className)}>
      {withGlow ? (
        <>
          <div className="absolute left-0 top-0 size-24 rounded-full bg-success/30 opacity-10 blur-[1.25rem] will-change-transform sm:size-32 sm:opacity-12 sm:blur-[1.5rem] md:size-[220px] md:opacity-18 md:blur-[2.25rem] lg:size-[550px] lg:opacity-80 lg:blur-[80px] dark:bg-success/40 dark:opacity-8 sm:dark:opacity-10 md:dark:opacity-14 lg:dark:opacity-70" />

          <div className="absolute left-14 top-16 hidden rounded-full bg-success/20 will-change-transform sm:block sm:size-[84px] sm:opacity-8 sm:blur-[1.5rem] md:size-[140px] md:opacity-12 md:blur-[2rem] lg:left-20 lg:top-20 lg:size-[400px] lg:opacity-60 lg:blur-[70px] dark:bg-success/30 sm:dark:opacity-6 md:dark:opacity-10 lg:dark:opacity-50" />

          <div className="absolute bottom-0 right-0 size-[92px] rounded-full bg-primary/30 opacity-10 blur-[1.25rem] will-change-transform sm:size-[124px] sm:opacity-12 sm:blur-[1.5rem] md:size-[210px] md:opacity-18 md:blur-[2.25rem] lg:size-[500px] lg:opacity-70 lg:blur-[80px] dark:bg-primary/40 dark:opacity-8 sm:dark:opacity-10 md:dark:opacity-14 lg:dark:opacity-60" />

          <div className="absolute bottom-20 right-8 hidden rounded-full bg-primary/20 will-change-transform sm:block sm:size-[78px] sm:opacity-8 sm:blur-[1.5rem] md:bottom-28 md:right-14 md:size-[130px] md:opacity-11 md:blur-[2rem] lg:bottom-40 lg:right-20 lg:size-[350px] lg:opacity-60 lg:blur-[75px] dark:bg-primary/30 sm:dark:opacity-6 md:dark:opacity-9 lg:dark:opacity-50" />

          <div className="absolute right-0 top-1/4 hidden rounded-full bg-primary/30 will-change-transform md:block md:size-[130px] md:opacity-10 md:blur-[2rem] lg:size-80 lg:opacity-60 lg:blur-[70px] dark:bg-primary/40 md:dark:opacity-8 lg:dark:opacity-50" />

          <div className="absolute right-12 top-1/3 hidden rounded-full bg-secondary/20 will-change-transform md:block md:size-[105px] md:opacity-8 md:blur-[1.75rem] lg:right-20 lg:size-[250px] lg:opacity-50 lg:blur-[65px] dark:bg-secondary/30 md:dark:opacity-6 lg:dark:opacity-40" />

          <div className="absolute bottom-1/3 left-0 hidden rounded-full bg-success/20 will-change-transform sm:block sm:size-[72px] sm:opacity-8 sm:blur-[1.5rem] md:size-[120px] md:opacity-12 md:blur-[2rem] lg:size-80 lg:opacity-70 lg:blur-[70px] dark:bg-success/30 sm:dark:opacity-6 md:dark:opacity-10 lg:dark:opacity-60" />

          <div className="absolute bottom-1/4 left-10 hidden rounded-full bg-secondary/15 will-change-transform sm:block sm:size-[62px] sm:opacity-7 sm:blur-[1.5rem] md:left-14 md:size-[95px] md:opacity-10 md:blur-[1.75rem] lg:left-20 lg:size-60 lg:opacity-60 lg:blur-[65px] dark:bg-secondary/25 sm:dark:opacity-6 md:dark:opacity-8 lg:dark:opacity-50" />

          <div className="absolute left-1/2 top-1/2 size-[170px] -translate-1/2 rounded-full bg-primary/20 opacity-16 blur-[2rem] will-change-transform sm:size-[220px] sm:opacity-20 sm:blur-[2.25rem] md:size-80 md:opacity-28 md:blur-[3rem] lg:size-[450px] lg:opacity-60 lg:blur-[80px] dark:bg-primary/30 dark:opacity-12 sm:dark:opacity-16 md:dark:opacity-22 lg:dark:opacity-50" />

          <div className="absolute left-1/2 top-1/2 size-[130px] -translate-1/3 rounded-full bg-secondary/15 opacity-12 blur-[1.75rem] will-change-transform sm:size-[180px] sm:opacity-16 sm:blur-[2rem] md:size-[260px] md:opacity-24 md:blur-[2.75rem] lg:size-[350px] lg:opacity-50 lg:blur-[75px] dark:bg-secondary/20 dark:opacity-10 sm:dark:opacity-13 md:dark:opacity-19 lg:dark:opacity-40" />
        </>
      ) : null}

      <div
        className={cn(
          "relative z-10 overflow-hidden rounded-2xl bg-card p-2 shadow-2xl shadow-foreground/10",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
