import { createClient } from "@/lib/supabase/server";
import type { Property } from "@/lib/types";
import { PropertiesClient } from "./properties-client";

export default async function PropertiesPage() {
  const supabase = await createClient();

  const { data: properties } = await supabase
    .from("properties")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  const list = (properties as unknown as Property[]) ?? [];

  return <PropertiesClient initialProperties={list} />;
}
