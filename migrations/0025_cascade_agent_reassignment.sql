-- 0025_cascade_agent_reassignment.sql
--
-- Bug: reassigning a CONTACT to another agent updated contacts.agent_id but not
-- the linked deals.agent_id. The pipeline kanban filters by deals.agent_id, so
-- reassigned leads stayed in the previous agent's pipeline (e.g. Jaz / Myrna
-- Pagan moved to Jenny Rojas but their deals stayed with Ivan Pimentel).
--
-- Fix: an AFTER UPDATE trigger on contacts propagates the new owner to that
-- contact's OPEN deals. Closed deals (closed_won / closed_lost) are excluded so
-- historical commission attribution and KPI history are never rewritten. The
-- function is SECURITY DEFINER with a pinned search_path so the cascade applies
-- regardless of the updating role's RLS on deals (UI, Meta poller, imports).

CREATE OR REPLACE FUNCTION public.cascade_contact_agent_to_deals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  UPDATE public.deals
     SET agent_id = NEW.agent_id
   WHERE contact_id = NEW.id
     AND agent_id IS DISTINCT FROM NEW.agent_id
     AND stage NOT IN ('closed_won', 'closed_lost');
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_cascade_contact_agent ON public.contacts;
CREATE TRIGGER trg_cascade_contact_agent
AFTER UPDATE OF agent_id ON public.contacts
FOR EACH ROW
WHEN (OLD.agent_id IS DISTINCT FROM NEW.agent_id)
EXECUTE FUNCTION public.cascade_contact_agent_to_deals();

-- One-time backfill of existing stale OPEN deals (repairs Jaz, Myrna Pagan,
-- Victor Lluberes). Same closed-stage exclusion as the trigger.
UPDATE public.deals d
   SET agent_id = c.agent_id
  FROM public.contacts c
 WHERE d.contact_id = c.id
   AND d.agent_id IS DISTINCT FROM c.agent_id
   AND d.stage NOT IN ('closed_won', 'closed_lost');
