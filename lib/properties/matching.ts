import { createClient } from "@/lib/supabase/server";
import type { PropertyType, CurrencyType } from "@/lib/types";

export interface PropertyMatch {
  id: string;
  title: string;
  price: number;
  currency: CurrencyType | null;
  property_type: PropertyType;
  status: string;
  city: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  match_score: 1 | 2; // 1 = price range match only; 2 = price + property type match
}

export async function getMatchedProperties(contactId: string): Promise<PropertyMatch[]> {
  const supabase = await createClient();

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("budget_min, budget_max, budget_currency, property_type_interest")
    .eq("id", contactId)
    .single();

  if (contactError || !contact) return [];

  const { budget_min, budget_max, property_type_interest } = contact as {
    budget_min: number | null;
    budget_max: number | null;
    budget_currency: CurrencyType | null;
    property_type_interest: PropertyType | null;
  };

  // No budget data means Ava hasn't captured preferences yet — return empty
  if (budget_min == null && budget_max == null) return [];

  let query = supabase
    .from("properties")
    .select("id, title, price, currency, property_type, status, city, bedrooms, bathrooms")
    .eq("status", "active");

  if (budget_min != null) query = query.gte("price", budget_min);
  if (budget_max != null) query = query.lte("price", budget_max);

  const { data: properties, error } = await query.order("price").limit(20);
  if (error || !properties) return [];

  return (properties as Omit<PropertyMatch, "match_score">[])
    .map((p) => ({
      ...p,
      match_score: (
        property_type_interest != null && p.property_type === property_type_interest
      ) ? 2 : 1,
    } as PropertyMatch))
    .sort((a, b) => b.match_score - a.match_score || a.price - b.price)
    .slice(0, 6);
}
