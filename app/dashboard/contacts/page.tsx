import { createClient } from "@/lib/supabase/server";
import { getSessionAgent, isPrivileged } from "@/lib/supabase/get-session-agent";
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
  const session = await getSessionAgent();

  let query = supabase
    .from("contacts")
    .select(
      "id, first_name, last_name, phone, email, lead_classification, lead_status, source, lead_score, budget_min, budget_max, budget_currency, property_type_interest, preferred_locations, last_activity_at, created_at, agent:agents!contacts_agent_id_fkey(full_name)"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (!isPrivileged(session.role)) {
    query = query.eq("agent_id", session.agentId);
  }

  if (params.q) {
    // Sanitize: strip PostgREST filter metacharacters, limit length
    const safeQ = params.q.replace(/[(),]/g, "").slice(0, 100);
    query = query.or(
      `first_name.ilike.%${safeQ}%,last_name.ilike.%${safeQ}%,phone.ilike.%${safeQ}%,email.ilike.%${safeQ}%`
    );
  }
  if (params.classification) {
    query = query.eq("lead_classification", params.classification);
  }
  if (params.status) {
    query = query.eq("lead_status", params.status);
  }

  const { data: contacts, error: contactsError } = await query;
  if (contactsError) {
    console.error('[contacts] query error:', JSON.stringify(contactsError));
  }

  const total = contacts?.length ?? 0;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0e0e0e",
      }}
    >
      {/* Sticky header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          background: "rgba(14,14,14,0.80)",
          backdropFilter: "blur(12px)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 32px",
          height: 96,
          borderBottom: "1px solid rgba(79,69,55,0.08)",
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "Manrope, var(--font-manrope), sans-serif",
              fontSize: 28,
              fontWeight: 700,
              color: "#e5e2e1",
              lineHeight: 1.2,
              margin: 0,
            }}
          >
            Clientes
          </h1>
          <p
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "#d3c4b1",
              marginTop: 4,
              margin: "4px 0 0",
            }}
          >
            {total} contacto{total !== 1 ? "s" : ""} en total
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Export button — links to CSV export API with current filters */}
          {(() => {
            const exportParams = new URLSearchParams();
            if (params.q)             exportParams.set("q", params.q);
            if (params.classification) exportParams.set("classification", params.classification);
            if (params.status)         exportParams.set("status", params.status);
            const href = `/api/contacts/export${exportParams.size > 0 ? `?${exportParams}` : ""}`;
            return (
              <a
                href={href}
                download
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 16px",
                  background: "#2a2a2a",
                  color: "#e5e2e1",
                  fontSize: 14,
                  fontWeight: 500,
                  borderRadius: 8,
                  border: "1px solid rgba(201,150,58,0.2)",
                  cursor: "pointer",
                  textDecoration: "none",
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
                Exportar CSV
              </a>
            );
          })()}

          {/* Nuevo Cliente gold button */}
          <NewContactButton />
        </div>
      </header>

      {/* Filter Bar + Table */}
      <section style={{ padding: "32px 32px 48px" }}>
        <ContactsFilterBar
          currentClassification={params.classification}
          currentSearch={params.q}
          totalCount={total}
        />
        <ContactsTable contacts={(contacts as unknown as Contact[]) ?? []} />
      </section>
    </div>
  );
}
