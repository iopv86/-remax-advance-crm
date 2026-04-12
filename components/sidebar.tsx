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
      className="flex flex-col w-[272px] shrink-0 min-h-screen overflow-y-auto"
      style={{
        background: "linear-gradient(180deg, #fffcfc 0%, #f8fafc 68%, #f5f7fb 100%)",
        borderRight: "1px solid rgba(203,213,225,0.7)",
      }}
    >
      {/* Logo */}
      <div className="px-5 pt-6 pb-5">
        <Logo size="sm" />
      </div>

      {/* Ava info card */}
      <div className="mx-3 mb-4 rounded-[20px] border border-rose-100 p-4"
        style={{ background: "linear-gradient(135deg, #fff1f2 0%, #ffffff 50%, #fffbeb 100%)" }}>
        <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <Sparkles className="h-4 w-4 text-rose-500" />
          Ava IA activa
        </div>
        <p className="mt-1.5 text-xs leading-5 text-slate-500">
          Atendiendo leads de WhatsApp y sincronizando al CRM en tiempo real.
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5">
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
                "flex items-center gap-3 px-3 py-3 text-sm font-medium transition-all duration-150",
                active ? "nav-item-active" : "sidebar-nav-hover text-slate-600 hover:text-slate-900"
              )}
            >
              <Icon
                className={cn("h-4 w-4 shrink-0 nav-icon", !active && "text-slate-400")}
              />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Quick actions — dark block */}
      <div className="mx-3 mb-4 mt-6 rounded-[24px] bg-slate-950 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.22)]">
        <div
          className="text-xs font-semibold uppercase tracking-[0.25em] mb-3"
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          Acciones rápidas
        </div>
        <QuickActionSheets />
      </div>

      {/* Logout */}
      <div className="px-3 pb-5 pt-1">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium text-slate-400 transition-all sidebar-nav-hover hover:text-slate-700"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
