import { createClient } from "@/lib/supabase/server";
import { ConversationsClient } from "./conversations-client";

export default async function ConversationsPage() {
  const supabase = await createClient();

  const { data: messages } = await supabase
    .from("messages")
    .select(
      "id, contact_id, direction, channel, content, is_automated, created_at, contact:contacts(first_name, last_name, phone, lead_classification)"
    )
    .eq("channel", "whatsapp")
    .order("created_at", { ascending: false })
    .limit(200);

  // Deduplicate: last message per contact
  const seen = new Set<string>();
  const conversations: typeof messages = [];
  for (const msg of messages ?? []) {
    if (!seen.has(msg.contact_id)) {
      seen.add(msg.contact_id);
      conversations.push(msg);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <ConversationsClient initialConversations={conversations as any} />;
}
