import { useEffect, useState } from "react";

export function usePersistentSidebarState(storageKey: string) {
  const [collapsed, setCollapsed] = useState(() => readSidebarPreference(storageKey));

  useEffect(() => {
    window.localStorage.setItem(storageKey, String(collapsed));
  }, [collapsed, storageKey]);

  return [collapsed, setCollapsed] as const;
}

function readSidebarPreference(storageKey: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(storageKey) === "true";
}
