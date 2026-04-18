"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
  UserCircle,
  Bell,
  FileBarChart,
  Target,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Logo } from "@/components/logo";
import { QuickActionSheets } from "@/components/quick-action-sheets";
import { createClient } from "@/lib/supabase/client";

const ALL_NAV_ITEMS = [
  { href: "/dashboard",                 label: "Dashboard",       icon: LayoutGrid,   roles: ["admin","manager","agent","viewer"] },
  { href: "/dashboard/contacts",        label: "Clientes",        icon: Users,        roles: ["admin","manager","agent"] },
  { href: "/dashboard/pipeline",        label: "Oportunidades",   icon: Kanban,       roles: ["admin","manager","agent"] },
  { href: "/dashboard/properties",      label: "Propiedades",     icon: Building2,    roles: ["admin","manager","agent"] },
  { href: "/dashboard/tasks",           label: "Tareas",          icon: CheckSquare,  roles: ["admin","manager","agent"] },
  { href: "/dashboard/conversations",   label: "Conversaciones",  icon: MessageSquare,roles: ["admin","manager","agent"] },
  { href: "/dashboard/notifications",   label: "Notificaciones",  icon: Bell,         roles: ["admin","manager","agent"] },
  { href: "/dashboard/agents",          label: "KPIs Agentes",    icon: BarChart3,    roles: ["admin","manager"] },
  { href: "/dashboard/reports",         label: "Reportes",        icon: FileBarChart, roles: ["admin","manager"] },
  { href: "/dashboard/ads",             label: "Publicidad",      icon: Megaphone,    roles: ["admin","manager"] },
];

const ALL_SETTINGS_ITEMS = [
  { href: "/dashboard/settings",                 label: "Configuración",  icon: Settings,   sub: false, roles: ["admin"] },
  { href: "/dashboard/settings/AvaIA",           label: "Ava IA",         icon: Bot,        sub: true,  roles: ["admin"] },
  { href: "/dashboard/settings/objectives",      label: "Objetivos",      icon: Target,     sub: true,  roles: ["admin", "manager"] },
  { href: "/dashboard/settings/round-robin",     label: "Round Robin",    icon: RefreshCw,  sub: true,  roles: ["admin", "manager"] },
];

export function Sidebar({ role = "agent" }: { role?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();

    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("read", false)
      .then(({ count }) => setUnreadCount(count ?? 0));

    supabase.auth.getUser().then(({ data }) => {
      const userId = data.user?.id;
      if (!userId) return;
      const channel = supabase
        .channel("sidebar-notif-count")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => {
          setUnreadCount((n) => n + 1);
        })
        .subscribe();
      return () => supabase.removeChannel(channel);
    });
  }, []);

  const navItems = ALL_NAV_ITEMS.filter((item) => item.roles.includes(role));
  const settingsItems = ALL_SETTINGS_ITEMS.filter((item) => item.roles.includes(role));

  async function handleLogout() {
    await fetch("/api/auth/sign-out", { method: "POST" });
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
        <Logo size="md" />
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
          const isNotif = href === "/dashboard/notifications";
          const badge = isNotif && unreadCount > 0;

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
              <span className="flex-1">{label}</span>
              {badge && (
                <span
                  style={{
                    background: "#ef4444",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 9999,
                    lineHeight: 1.6,
                    minWidth: 18,
                    textAlign: "center",
                  }}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
          );
        })}

        {/* Settings group */}
        <div className="pt-1">
          {settingsItems.map(({ href, label, icon: Icon, sub }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 py-2.5 text-sm font-medium transition-all duration-150 border-l-4",
                  sub ? "pl-10 pr-5" : "px-5",
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
        </div>
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

      {/* Profile + Logout */}
      <div className="px-3 pb-5 pt-1 space-y-1">
        <Link
          href="/dashboard/profile"
          className={cn(
            "flex w-full items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium transition-all hover:bg-white/5",
            pathname.startsWith("/dashboard/profile")
              ? "text-[#C9963A] bg-[rgba(201,150,58,0.08)]"
              : "text-gray-400 hover:text-white"
          )}
        >
          <UserCircle className={cn("h-4 w-4", pathname.startsWith("/dashboard/profile") ? "text-[#C9963A]" : "text-gray-500")} />
          Mi Perfil
        </Link>
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
