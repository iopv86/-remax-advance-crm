-- Migration: 0008_contacts_agent_insert_policy
-- Description: Allows authenticated agents to INSERT contacts assigned to themselves.
--
-- Root cause of bug:
--   The original contacts RLS only permits writes via is_privileged_user()
--   (admin / manager). Regular agents have no INSERT policy, so every attempt
--   to create a contact from the browser client throws:
--   "new row violates row-level security policy for table contacts"
--
-- Fix:
--   Add a separate INSERT policy that permits any authenticated user to insert
--   a contact, provided the new row's agent_id matches the ID of their own
--   agent record (looked up by email from the JWT).
--
--   This is the correct pattern for this schema:
--     auth.uid()  = Supabase auth UUID (not the agents.id)
--     agents.id   = CRM agent UUID  (linked by agents.email = auth.email())
--
-- Run in: Supabase SQL Editor (project zlnqsgepzfghlmsfolko)

CREATE POLICY "contacts_insert_own"
  ON contacts
  FOR INSERT
  WITH CHECK (
    agent_id IN (
      SELECT id
      FROM agents
      WHERE email = auth.email()
    )
  );
