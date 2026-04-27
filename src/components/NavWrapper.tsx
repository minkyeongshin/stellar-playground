"use client";

import { ReactNode } from "react";
import { NavProvider } from "@/contexts/NavContext";
import { TopNav } from "@/components/TopNav";

export function NavWrapper({ children }: { children: ReactNode }) {
  return (
    <NavProvider>
      <div className="flex h-full flex-col">
        <TopNav />
        {children}
      </div>
    </NavProvider>
  );
}
