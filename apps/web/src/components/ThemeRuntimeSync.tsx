import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { defaultAppearanceTheme } from "@wrapt/contracts";
import { wraptQueries } from "../lib/queryOptions";
import { applyAppearanceTheme } from "../lib/themeRuntime";

export function ThemeRuntimeSync() {
  const appearance = useQuery(wraptQueries.appearance());
  useEffect(() => {
    applyAppearanceTheme(appearance.data?.theme ?? defaultAppearanceTheme);
  }, [appearance.data?.theme]);
  return null;
}
