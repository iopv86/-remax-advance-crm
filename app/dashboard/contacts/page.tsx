import { createClient } from "@/lib/supabase/server";
import type { Contact } from "@/lib/types";
import { ContactsTable } from "./contacts-table";
import { ContactsFilterBar } from "./contacts-filter-bar";
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
    .select(
      "id, first_name, last_name, phone, email, lead_classification, lead_status, source, lead_score, budget_min, budget_max, budget_currency, property_type_interest, preferred_locations, last_activity_at, created_at, agent:agents(full_name)"
    )
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
      {/* Page Header */}
      <div className="px-12 pt-10 pb-6">
        <div className="flex justify-between items-end">
          <div>
            <h2
              className="font-extrabold tracking-tight"
              style={{
                fontFamily: "var(--font-manrope), Manrope, sans-serif",
                fontSize: 28,
                color: "#1C1917",
              }}
            >
              Contactos
            </h2>
            <p className="text-sm mt-1" style={{ color: "#64748b" }}>
              Gestiona tu cartera de inversionistas y prospectos.
            </p>
          </div>
          <NewContactButton />
        </div>
      </div>

      {/* Filter Bar + Table */}
      <div className="px-12 pb-12 space-y-5">
        <ContactsFilterBar
          currentClassification={params.classification}
          currentSearch={params.q}
          totalCount={contacts?.length ?? 0}
        />
        <ContactsTable contacts={(contacts as unknown as Contact[]) ?? []} />
      </div>
    </div>
  );
}
