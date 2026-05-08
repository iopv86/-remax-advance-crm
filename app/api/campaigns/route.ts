import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { campaignCreateSchema } from "@/app/dashboard/ads/_schemas/campaign";

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

// GET /api/campaigns
// Returns all campaigns ordered by start_date desc.
// Auth: admin or manager role required.
export async function GET() {
  const { supabase, user, error } = await requireManagerOrAdmin();
  if (error) return error;

  const rl = await checkRateLimit(`campaigns-list:${user!.id}`, 30, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

  const { data, error: dbError } = await supabase
    .from("campaigns")
    .select("*")
    .order("start_date", { ascending: false })
    .limit(200);

  if (dbError) {
    console.error("[GET /api/campaigns]", dbError.message);
    return NextResponse.json({ error: "Error al obtener campañas" }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// POST /api/campaigns
// Creates a new campaign. Body: CampaignCreate (JSON).
// Auth: admin or manager role required.
export async function POST(request: Request) {
  const { supabase, user, error } = await requireManagerOrAdmin();
  if (error) return error;

  const rl = await checkRateLimit(`campaigns-create:${user!.id}`, 10, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = campaignCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validación fallida", details: parsed.error.flatten() }, { status: 422 });
  }

  const { data, error: dbError } = await supabase
    .from("campaigns")
    .insert(parsed.data)
    .select()
    .single();

  if (dbError) {
    console.error("[POST /api/campaigns]", dbError.message);
    return NextResponse.json({ error: "Error al crear campaña" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
