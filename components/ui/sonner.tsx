"use client";

import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      closeButton
      richColors
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      mobileOffset={{
        bottom: "calc(var(--viewport-gutter) + var(--safe-bottom))",
        left: "calc(var(--viewport-gutter) + var(--safe-left))",
        right: "calc(var(--viewport-gutter) + var(--safe-right))",
        top: "calc(var(--viewport-gutter) + var(--safe-top))",
      }}
      offset={{
        bottom: "calc(1.5rem + var(--safe-bottom))",
        left: "calc(1.5rem + var(--safe-left))",
        right: "calc(1.5rem + var(--safe-right))",
        top: "calc(1.5rem + var(--safe-top))",
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          "--width": "min(480px, calc(100dvw - 2 * var(--viewport-gutter)))",
        } as React.CSSProperties
      }
      theme={theme as ToasterProps["theme"]}
      toastOptions={{
        classNames: {
          toast: "whitespace-pre-line leading-relaxed items-start",
          content: "max-h-[calc(var(--overlay-block-budget)/2)] overflow-y-auto overscroll-contain",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
