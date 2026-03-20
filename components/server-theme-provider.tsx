"use client";

import type { ReactNode } from "react";

import { createContext, useContext, useEffect } from "react";
import { useTheme } from "next-themes";

const ServerThemeContext = createContext<string | undefined>(undefined);

export function useServerTheme() {
  return useContext(ServerThemeContext);
}

function ThemeCookieSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (resolvedTheme) document.cookie = `theme=${resolvedTheme};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
  }, [resolvedTheme]);

  return null;
}

type Props = {
  children: ReactNode;
  serverTheme?: string;
};

export function ServerThemeProvider({ children, serverTheme }: Props) {
  return (
    <ServerThemeContext.Provider value={serverTheme}>
      <ThemeCookieSync />

      {children}
    </ServerThemeContext.Provider>
  );
}
