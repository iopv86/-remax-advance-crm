import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/rate-limit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function randomSlug(len = 12): string {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export async function POST(req: NextRequest) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const rl = await checkRateLimit(`proposals:${user.id}`, 20, 3_600_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Demasiadas propuestas. Intenta más tarde." }, { status: 429 });
  }

  let body: {
    propertyIds: string[];
    title?: string;
    message?: string;
    contactName?: string;
    contactId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { propertyIds, title, message, contactName, contactId } = body;

  if (!propertyIds?.length || propertyIds.length > 10) {
    return NextResponse.json({ error: "Selecciona entre 1 y 10 propiedades" }, { status: 400 });
  }
  if (propertyIds.some((id) => !UUID_RE.test(id))) {
    return NextResponse.json({ error: "IDs inválidos" }, { status: 400 });
  }
  if (contactId && !UUID_RE.test(contactId)) {
    return NextResponse.json({ error: "contactId inválido" }, { status: 400 });
  }

  // Get agent id
  const { data: agent } = await service
    .from("agents")
    .select("id")
    .eq("email", user.email!)
    .maybeSingle();

  if (!agent) return NextResponse.json({ error: "Agente no encontrado" }, { status: 404 });

  // Generate unique slug
  let slug = randomSlug();
  for (let i = 0; i < 5; i++) {
    const { data: existing } = await service
      .from("property_proposals")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    slug = randomSlug();
  }

  const { data: proposal, error } = await service
    .from("property_proposals")
    .insert({
      agent_id: agent.id,
      slug,
      title: title?.trim() || null,
      message: message?.trim() || null,
      property_ids: propertyIds,
      contact_name: contactName?.trim() || null,
      contact_id: contactId || null,
    })
    .select("id, slug")
    .single();

  if (error || !proposal) {
    return NextResponse.json({ error: "Error creando propuesta" }, { status: 500 });
  }

  return NextResponse.json({ slug: proposal.slug });
}

export async function GET(req: NextRequest) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { data: agent } = await service
    .from("agents")
    .select("id")
    .eq("email", user.email!)
    .maybeSingle();
  if (!agent) return NextResponse.json({ proposals: [] });

  const { data: proposals } = await service
    .from("property_proposals")
    .select("id, slug, title, message, property_ids, contact_name, view_count, created_at")
    .eq("agent_id", agent.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return NextResponse.json({ proposals: proposals ?? [] });
}
