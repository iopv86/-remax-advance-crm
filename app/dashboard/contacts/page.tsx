import { createClient } from "@/lib/supabase/server";
import type { Contact } from "@/lib/types";
import { ContactsSearch } from "./contacts-search";
import { ContactsTable } from "./contacts-table";
import { Users } from "lucide-react";
import { NewContactButton } from "@/components/quick-action-sheets";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; classification?: string; status?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("contacts")
    .select("id, first_name, last_name, phone, email, lead_classification, lead_status, source, lead_score, budget_min, budget_max, budget_currency, created_at, agent:agents(full_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (params.q) {
    query = query.or(
      `first_name.ilike.%${params.q}%,last_name.ilike.%${params.q}%,phone.ilike.%${params.q}%,email.ilike.%${params.q}%`
    );
  }
  if (params.classification) {
    query = query.eq("lead_classification", params.classification);
  }
  if (params.status) {
    query = query.eq("lead_status", params.status);
  }

  const { data: contacts } = await query;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Page header */}
      <div className="page-header animate-fade-up">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 mb-1">
              Base de datos
            </p>
            <h1
              style={{
                fontFamily: "var(--font-playfair),Georgia,serif",
                fontWeight: 700,
                fontSize: 30,
                letterSpacing: "-0.02em",
                color: "var(--foreground)",
                lineHeight: 1.1,
              }}
            >
              Contactos
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <NewContactButton />
            <div className="flex items-center gap-2 rounded-full border border-rose-100 bg-white/80 px-3 py-1.5 text-xs font-medium text-rose-700 shadow-sm backdrop-blur">
              <Users className="h-3.5 w-3.5" />
              {contacts?.length ?? 0} contactos
            </div>
          </div>
        </div>
      </div>

      <div className="p-7 space-y-5 animate-fade-up-1">
        <ContactsSearch />
        <ContactsTable contacts={(contacts as unknown as Contact[]) ?? []} />
      </div>
    </div>
  );
}
