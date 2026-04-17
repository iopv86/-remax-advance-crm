import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: agents }, { data: agent }] = await Promise.all([
    supabase
      .from("agents")
      .select("id, full_name, role, phone, email, avatar_url, is_active, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("agents")
      .select("*")
      .eq("email", user?.email ?? "")
      .single(),
  ]);

  return (
    <Suspense fallback={<div className="p-8 text-sm" style={{ color: "var(--muted-foreground)" }}>Cargando configuración…</div>}>
      <SettingsClient
        agents={agents ?? []}
        currentAgent={agent ?? null}
        currentUser={user}
      />
    </Suspense>
  );
}
