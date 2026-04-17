import { createClient } from "@/lib/supabase/server";
import { NotificationsClient } from "./notifications-client";

export default async function NotificationsPage() {
  const supabase = await createClient();

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, user_id, type, title, body, read, link, created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("read", false);

  return (
    <NotificationsClient
      initialNotifications={(notifications ?? []) as NotificationRow[]}
      initialUnread={unreadCount ?? 0}
    />
  );
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  link: string | null;
  created_at: string;
}
