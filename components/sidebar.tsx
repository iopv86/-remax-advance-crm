"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutGrid,
  Users,
  Kanban,
  Building2,
  CheckSquare,
  MessageSquare,
  Settings,
  LogOut,
  Bot,
  Megaphone,
  BarChart3,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Logo } from "@/components/logo";
import { QuickActionSheets } from "@/components/quick-action-sheets";

const navItems = [
  { href: "/dashboard",               label: "Dashboard",       icon: LayoutGrid },
  { href: "/dashboard/contacts",      label: "Clientes",        icon: Users },
  { href: "/dashboard/pipeline",      label: "Oportunidades",   icon: Kanban },
  { href: "/dashboard/properties",    label: "Propiedades",     icon: Building2 },
  { href: "/dashboard/tasks",         label: "Tareas",          icon: CheckSquare },
  { href: "/dashboard/conversations", label: "Conversaciones",  icon: MessageSquare },
  { href: "/dashboard/ava",           label: "Ava IA",          icon: Bot },
  { href: "/dashboard/agents",        label: "KPIs Agentes",    icon: BarChart3 },
  { href: "/dashboard/ads",           label: "Publicidad",      icon: Megaphone },
  { href: "/dashboard/settings",      label: "Configuración",   icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success("Sesión cerrada");
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      className="flex flex-col w-[260px] shrink-0 min-h-screen overflow-y-auto"
      style={{
        background: "var(--sidebar)",
        borderRight: "1px solid var(--sidebar-border)",
      }}
    >
      {/* Logo */}
      <div className="px-5 pt-6 pb-5">
        <Logo size="sm" logoStyle="professional" className="text-white" />
      </div>

      {/* Ava status pill */}
      <div className="mx-3 mb-4 rounded-2xl px-4 py-3"
        style={{ background: "var(--sidebar-accent)", border: "1px solid var(--sidebar-accent-border)" }}>
        <div className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--sidebar-primary)" }}>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
              style={{ background: "var(--sidebar-primary)" }}></span>
            <span className="relative inline-flex rounded-full h-2 w-2"
              style={{ background: "var(--sidebar-primary)" }}></span>
          </span>
          <Sparkles className="h-3.5 w-3.5" />
          Ava activa
        </div>
        <p className="mt-1 text-xs leading-4" style={{ color: "rgba(255,255,255,0.3)" }}>
          Atendiendo WhatsApp en tiempo real
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-all duration-150 border-l-4",
                active
                  ? "text-[#C9963A] border-[#C9963A] bg-[rgba(201,150,58,0.08)]"
                  : "text-gray-400 border-transparent hover:text-white hover:bg-white/5"
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", active ? "text-[#C9963A]" : "text-gray-500")} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Quick actions */}
      <div className="mx-3 mb-4 mt-6 rounded-[20px] p-4"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="text-xs font-semibold uppercase tracking-[0.2em] mb-3"
          style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--font-manrope)" }}>
          Acciones rápidas
        </div>
        <QuickActionSheets />
      </div>

      {/* Logout */}
      <div className="px-3 pb-5 pt-1">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium transition-all hover:bg-white/5"
          style={{ color: "rgba(255,255,255,0.3)" }}
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
