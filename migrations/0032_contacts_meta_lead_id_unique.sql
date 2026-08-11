-- 0032_contacts_meta_lead_id_unique.sql
--
-- Without this constraint, two concurrent processLead runs for the SAME Meta
-- lead (webhook and poll landing together, or two overlapping cron invocations
-- -- Vercel does not guarantee mutual exclusion between runs of the same route)
-- each create their own contact, assign a DIFFERENT round-robin agent, enqueue a
-- separate CAPI event, and send a WhatsApp notification to two different agents
-- about one physical person.
--
-- The phone-based dedup path was already protected by contacts_phone_real_uidx
-- (migration 0009), so this only ever bit leads whose phone failed isValidPhone.
-- With this index the losing insert raises 23505 and falls into the race_winner
-- branch that lib/meta-leads.ts already implements.
--
-- Verified before applying: 0 duplicate meta_lead_id values in contacts.
-- Purely additive.

create unique index if not exists contacts_meta_lead_id_uidx
  on contacts (meta_lead_id) where meta_lead_id is not null;

-- NOT APPLIED YET, needs a human decision first
-- ---------------------------------------------------------------------------
-- The same check-then-insert race exists in createIntakeDeal: one contact can
-- end up with two open intake deals. There is already one real instance in
-- production -- contact 57b921f0-d01f-465f-88e8-b9b0b8db0f34 ("Liz") has two
-- lead_captured deals created ten minutes apart on 2026-07-10 by the same agent.
--
-- The constraint below would close the race, but it CANNOT be applied until that
-- duplicate is resolved, and choosing which of the two deals to keep is a
-- business call (they may carry different activity, notes or tasks), not a
-- migration's decision to make.
--
--   create unique index deals_one_open_intake_per_contact
--     on deals (contact_id) where stage in ('nuevo_sin_contactar', 'lead_captured');
--
-- createIntakeDeal in lib/meta-leads.ts already tolerates the 23505 this would
-- raise, so applying it is a one-line change once the duplicate is settled.
