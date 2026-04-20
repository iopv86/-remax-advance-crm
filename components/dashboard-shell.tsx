"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { Logo } from "@/components/logo";

export function DashboardShell({
  role,
  children,
}: {
  role: string;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-full">
      <Sidebar role={role} mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Mobile top bar — hidden on md+ */}
        <div
          className="flex items-center gap-3 h-12 px-3 md:hidden shrink-0"
          style={{
            background: "var(--sidebar)",
            borderBottom: "1px solid var(--sidebar-border)",
          }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex items-center justify-center w-8 h-8 rounded-lg"
            style={{ color: "#C9963A", background: "rgba(201,150,58,0.08)" }}
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Logo size="sm" />
        </div>

        <main className="flex-1 overflow-auto page-bg">{children}</main>
      </div>
    </div>
  );
}
