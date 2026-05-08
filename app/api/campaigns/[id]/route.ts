import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { campaignUpdateSchema } from "@/app/dashboard/ads/_schemas/campaign";

async function requireManagerOrAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, agent: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: agent } = await supabase
    .from("agents")
    .select("role")
    .eq("email", user.email!)
    .maybeSingle();

  if (!agent || !["admin", "manager"].includes(agent.role)) {
    return { supabase, user, agent: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { supabase, user, agent, error: null };
}

// PATCH /api/campaigns/[id]
// Partial update of a campaign. Body: CampaignUpdate (JSON).
// Auth: admin or manager role required.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user, error } = await requireManagerOrAdmin();
  if (error) return error;

  const rl = await checkRateLimit(`campaigns-edit:${user!.id}`, 20, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = campaignUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validación fallida", details: parsed.error.flatten() }, { status: 422 });
  }

  const { data, error: dbError } = await supabase
    .from("campaigns")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();

  if (dbError) {
    console.error("[PATCH /api/campaigns/[id]]", dbError.message);
    return NextResponse.json({ error: "Error al actualizar campaña" }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE /api/campaigns/[id]
// Archives a campaign by setting status = "ended".
// Does not hard-delete to preserve historical data.
// Auth: admin or manager role required.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user, error } = await requireManagerOrAdmin();
  if (error) return error;

  const rl = await checkRateLimit(`campaigns-delete:${user!.id}`, 10, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  const { data, error: dbError } = await supabase
    .from("campaigns")
    .update({ status: "ended" })
    .eq("id", id)
    .select("id, status")
    .single();

  if (dbError) {
    console.error("[DELETE /api/campaigns/[id]]", dbError.message);
    return NextResponse.json({ error: "Error al archivar campaña" }, { status: 500 });
  }

  return NextResponse.json(data);
}
