import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CLASSIFICATION_COLORS, CLASSIFICATION_LABELS } from "@/lib/types";
import type { Contact } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { ContactsSearch } from "./contacts-search";

const STATUS_LABELS: Record<string, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  qualified: "Calificado",
  unqualified: "No calificado",
  nurturing: "Nutriendo",
  archived: "Archivado",
};

const SOURCE_LABELS: Record<string, string> = {
  ctwa_ad: "CTWA Ad",
  lead_form: "Formulario",
  referral: "Referido",
  walk_in: "Walk-in",
  website: "Web",
  social_media: "Redes",
  other: "Otro",
};

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; classification?: string; status?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("contacts")
    .select("id, first_name, last_name, phone, email, lead_classification, lead_status, source, lead_score, created_at, agent:agents(full_name)")
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
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contactos</h1>
          <p className="text-sm text-gray-500 mt-1">{contacts?.length ?? 0} contactos</p>
        </div>
      </div>

      <ContactsSearch />

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Teléfono / Email</TableHead>
              <TableHead>Clasificación</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fuente</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Creado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {((contacts as unknown as Contact[]) ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-gray-400 py-8">
                  No se encontraron contactos.
                </TableCell>
              </TableRow>
            )}
            {((contacts as unknown as Contact[]) ?? []).map((c) => (
              <TableRow key={c.id} className="hover:bg-gray-50">
                <TableCell className="font-medium">
                  {c.first_name} {c.last_name}
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    {c.phone && <p>{c.phone}</p>}
                    {c.email && <p className="text-gray-400">{c.email}</p>}
                  </div>
                </TableCell>
                <TableCell>
                  {c.lead_classification ? (
                    <Badge variant="outline" className={`text-xs ${CLASSIFICATION_COLORS[c.lead_classification]}`}>
                      {CLASSIFICATION_LABELS[c.lead_classification]}
                    </Badge>
                  ) : (
                    <span className="text-gray-400 text-xs">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-sm text-gray-600">
                    {c.lead_status ? STATUS_LABELS[c.lead_status] ?? c.lead_status : "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-gray-500">
                    {c.source ? SOURCE_LABELS[c.source] ?? c.source : "—"}
                  </span>
                </TableCell>
                <TableCell>
                  {c.lead_score != null ? (
                    <span
                      className={`text-sm font-semibold ${
                        c.lead_score >= 8
                          ? "text-red-600"
                          : c.lead_score >= 5
                          ? "text-orange-500"
                          : c.lead_score >= 2
                          ? "text-blue-500"
                          : "text-gray-400"
                      }`}
                    >
                      {c.lead_score}/10
                    </span>
                  ) : (
                    <span className="text-gray-400 text-xs">—</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-gray-400">
                  {formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: es })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
