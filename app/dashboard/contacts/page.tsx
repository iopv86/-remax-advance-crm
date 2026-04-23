import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSessionAgent, isPrivileged } from "@/lib/supabase/get-session-agent";
import type { Contact } from "@/lib/types";
import { ContactsTable } from "./contacts-table";
import { ContactsFilterBar } from "./contacts-filter-bar";
import { NewContactButton } from "@/components/quick-action-sheets";

const PAGE_SIZE = 50;

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; classification?: string; status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const currentPage = Math.max(1, parseInt(params.page ?? "1", 10));
  const offset = (currentPage - 1) * PAGE_SIZE;

  const supabase = await createClient();
  const session = await getSessionAgent();

  // Count query (head: true = no rows, just count)
  let countQuery = supabase
    .from("contacts")
    .select("id", { count: "exact", head: true });

  // Data query
  let dataQuery = supabase
    .from("contacts")
    .select(
      "id, agent_id, first_name, last_name, phone, email, lead_classification, lead_status, source, lead_score, budget_min, budget_max, budget_currency, property_type_interest, preferred_locations, last_activity_at, created_at, agent:agents!contacts_agent_id_fkey(full_name)"
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (!isPrivileged(session.role)) {
    countQuery = countQuery.eq("agent_id", session.agentId);
    dataQuery = dataQuery.eq("agent_id", session.agentId);
  }

  if (params.q) {
    const safeQ = params.q.replace(/[(),]/g, "").slice(0, 100);
    const orFilter = `first_name.ilike.%${safeQ}%,last_name.ilike.%${safeQ}%,phone.ilike.%${safeQ}%,email.ilike.%${safeQ}%`;
    countQuery = countQuery.or(orFilter);
    dataQuery = dataQuery.or(orFilter);
  }
  if (params.classification) {
    countQuery = countQuery.eq("lead_classification", params.classification);
    dataQuery = dataQuery.eq("lead_classification", params.classification);
  }
  if (params.status) {
    countQuery = countQuery.eq("lead_status", params.status);
    dataQuery = dataQuery.eq("lead_status", params.status);
  }

  const [{ count: totalCount }, { data: contacts, error: contactsError }] = await Promise.all([
    countQuery,
    dataQuery,
  ]);

  if (contactsError) {
    console.error("[contacts] query error:", JSON.stringify(contactsError));
  }

  const total = totalCount ?? 0;

  // Build export href (server-side, used in <a> tag only)
  const exportFilterParts: string[] = [];
  if (params.q)              exportFilterParts.push(`q=${encodeURIComponent(params.q)}`);
  if (params.classification) exportFilterParts.push(`classification=${encodeURIComponent(params.classification)}`);
  if (params.status)         exportFilterParts.push(`status=${encodeURIComponent(params.status)}`);
  const exportHref = `/api/contacts/export${exportFilterParts.length > 0 ? `?${exportFilterParts.join("&")}` : ""}`;

  // Serializable filter params for pagination (no function needed)
  const paginationFilterParams: Record<string, string> = {};
  if (params.q)              paginationFilterParams.q = params.q;
  if (params.classification) paginationFilterParams.classification = params.classification;
  if (params.status)         paginationFilterParams.status = params.status;

  return (
    <div style={{ minHeight: "100vh", background: "#0e0e0e" }}>
      {/* Sticky header */}
      <header
        className="sticky top-0 z-40 flex justify-between items-center px-4 sm:px-8 border-b"
        style={{
          background: "rgba(14,14,14,0.80)", backdropFilter: "blur(12px)",
          minHeight: 72, borderColor: "rgba(79,69,55,0.08)",
        }}
      >
        <div>
          <h1
            className="text-2xl sm:text-3xl font-bold leading-tight"
            style={{ color: "#e5e2e1", margin: 0 }}
          >
            Clientes
          </h1>
          <p className="text-sm font-medium mt-1" style={{ color: "#d3c4b1" }}>
            {total} contacto{total !== 1 ? "s" : ""} en total
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <a
            href={exportHref}
            download
            className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              background: "#2a2a2a", color: "#e5e2e1",
              border: "1px solid rgba(201,150,58,0.2)", textDecoration: "none",
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            Exportar CSV
          </a>
          <NewContactButton />
        </div>
      </header>

      <section className="px-4 sm:px-8 py-6 sm:py-8 pb-12">
        <Suspense fallback={null}>
          <ContactsFilterBar
            currentClassification={params.classification}
            currentSearch={params.q}
            totalCount={total}
          />
        </Suspense>
        <ContactsTable
          contacts={(contacts as unknown as Contact[]) ?? []}
          pagination={{ currentPage, totalCount: total, pageSize: PAGE_SIZE, basePath: "/dashboard/contacts", filterParams: paginationFilterParams }}
          currentAgentId={session.agentId}
          currentRole={session.role}
        />
      </section>
    </div>
  );
}
