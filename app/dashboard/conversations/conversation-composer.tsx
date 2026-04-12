"use client";

import { WhatsAppComposer } from "@/components/whatsapp-composer";
import { useRouter } from "next/navigation";

interface Props {
  contactId: string;
  phone: string;
}

export function ConversationComposer({ contactId, phone }: Props) {
  const router = useRouter();
  return (
    <WhatsAppComposer
      contactId={contactId}
      phone={phone}
      onSent={() => router.refresh()}
    />
  );
}
