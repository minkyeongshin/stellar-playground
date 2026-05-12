"use client";

import { ReactNode } from "react";
import { NavProvider } from "@/contexts/NavContext";
import { TopNav } from "@/components/TopNav";

// Toggle to show/hide the top navigation bar
const SHOW_TOP_NAV = false;

export function NavWrapper({ children }: { children: ReactNode }) {
  return (
    <NavProvider>
      <div className="flex h-full flex-col">
        {SHOW_TOP_NAV && <TopNav />}
        {children}
      </div>
    </NavProvider>
  );
}
