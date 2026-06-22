-- B14 P01 T03: recrear vistas KPI para EXCLUIR 'nuevo_sin_contactar' del pipeline contable.
-- Pipeline contable = stage != 'nuevo_sin_contactar' (set explícito, nunca comparación ordinal del enum).

-- ── pipeline_summary ──────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW pipeline_summary AS
 SELECT d.agent_id,
    a.full_name AS agent_name,
    d.stage,
    count(*) AS deal_count,
    COALESCE(sum(d.deal_value), 0::numeric) AS total_value,
    COALESCE(avg(d.deal_value), 0::numeric) AS avg_value
   FROM deals d
     JOIN agents a ON a.id = d.agent_id
  WHERE d.stage <> ALL (ARRAY['closed_won'::deal_stage, 'closed_lost'::deal_stage, 'nuevo_sin_contactar'::deal_stage])
  GROUP BY d.agent_id, a.full_name, d.stage;

-- ── agent_monthly_kpis ────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW agent_monthly_kpis AS
 WITH month_bounds AS (
         SELECT date_trunc('month'::text, now())::date AS month_start,
            (date_trunc('month'::text, now()) + '1 mon'::interval)::date AS month_end
        ), closed_this_month AS (
         SELECT d.agent_id,
            count(*) AS deals_closed,
            sum(COALESCE(d.commission_value, d.deal_value * COALESCE(d.commission_percentage, 3::numeric) / 100.0)) AS total_revenue
           FROM deals d,
            month_bounds mb
          WHERE d.stage = 'closed_won'::deal_stage AND d.actual_close_date >= mb.month_start AND d.actual_close_date < mb.month_end
          GROUP BY d.agent_id
        ), active_pipeline AS (
         SELECT d.agent_id,
            count(*) AS deals_active,
            sum(COALESCE(d.deal_value, 0::numeric)) AS pipeline_value
           FROM deals d
          WHERE d.stage <> ALL (ARRAY['closed_won'::deal_stage, 'closed_lost'::deal_stage, 'nuevo_sin_contactar'::deal_stage])
          GROUP BY d.agent_id
        ), stalled AS (
         SELECT d.agent_id,
            count(*) AS stalled_deals_count
           FROM deals d
          WHERE (d.stage <> ALL (ARRAY['closed_won'::deal_stage, 'closed_lost'::deal_stage, 'nuevo_sin_contactar'::deal_stage])) AND d.stage_entered_at < (now() - '14 days'::interval)
          GROUP BY d.agent_id
        ), funnel_90d AS (
         SELECT deals.agent_id,
            count(*) FILTER (WHERE deals.stage = ANY (ARRAY['offer_made'::deal_stage, 'negotiation'::deal_stage, 'contract'::deal_stage, 'closed_won'::deal_stage, 'closed_lost'::deal_stage])) AS advanced_deals,
            count(*) FILTER (WHERE deals.stage = 'closed_won'::deal_stage) AS won_deals
           FROM deals
          WHERE deals.created_at >= (now() - '90 days'::interval)
          GROUP BY deals.agent_id
        ), task_comp AS (
         SELECT tasks.agent_id,
                CASE
                    WHEN count(*) > 0 THEN round(count(*) FILTER (WHERE tasks.status = 'completed'::task_status)::numeric / count(*)::numeric * 100::numeric, 1)
                    ELSE NULL::numeric
                END AS task_completion_rate
           FROM tasks
          GROUP BY tasks.agent_id
        ), followup_gaps AS (
         SELECT c.agent_id,
            EXTRACT(epoch FROM m.created_at - lag(m.created_at) OVER (PARTITION BY m.contact_id ORDER BY m.created_at)) / 86400.0 AS gap_days
           FROM messages m
             JOIN contacts c ON c.id = m.contact_id
          WHERE m.direction = 'outbound'::message_direction AND c.agent_id IS NOT NULL
        ), followup_cad AS (
         SELECT followup_gaps.agent_id,
            round(avg(followup_gaps.gap_days), 1) AS avg_followup_days
           FROM followup_gaps
          WHERE followup_gaps.gap_days IS NOT NULL AND followup_gaps.gap_days >= 0.01 AND followup_gaps.gap_days <= 30::numeric
          GROUP BY followup_gaps.agent_id
        ), fast_resp AS (
         SELECT c.agent_id,
                CASE
                    WHEN count(*) FILTER (WHERE c.is_responded = true) > 0 THEN round(count(*) FILTER (WHERE c.is_responded = true AND c.first_response_at IS NOT NULL AND (EXTRACT(epoch FROM c.first_response_at - COALESCE(c.assigned_at, c.created_at)) / 60::numeric) < 10::numeric)::numeric / count(*) FILTER (WHERE c.is_responded = true)::numeric * 100::numeric, 1)
                    ELSE NULL::numeric
                END AS fast_response_rate
           FROM contacts c
          WHERE c.agent_id IS NOT NULL
          GROUP BY c.agent_id
        )
 SELECT a.id AS agent_id,
    a.full_name,
    COALESCE(cl.deals_closed, 0::bigint) AS deals_closed,
    COALESCE(ap.deals_active, 0::bigint) AS deals_active,
    COALESCE(cl.total_revenue, 0::numeric) AS total_revenue,
    COALESCE(ap.pipeline_value, 0::numeric) AS pipeline_value,
        CASE
            WHEN COALESCE(cl.deals_closed, 0::bigint) = 0 THEN NULL::numeric
            ELSE round(cl.total_revenue / cl.deals_closed::numeric, 0)
        END AS avg_ticket_value,
    COALESCE(st.stalled_deals_count, 0::bigint) AS stalled_deals_count,
        CASE
            WHEN COALESCE(f.advanced_deals, 0::bigint) = 0 THEN NULL::numeric
            ELSE round(f.won_deals::numeric / f.advanced_deals::numeric * 100::numeric, 1)
        END AS conversion_rate,
    tc.task_completion_rate,
    fc.avg_followup_days,
    fr.fast_response_rate
   FROM agents a
     LEFT JOIN closed_this_month cl ON cl.agent_id = a.id
     LEFT JOIN active_pipeline ap ON ap.agent_id = a.id
     LEFT JOIN stalled st ON st.agent_id = a.id
     LEFT JOIN funnel_90d f ON f.agent_id = a.id
     LEFT JOIN task_comp tc ON tc.agent_id = a.id
     LEFT JOIN followup_cad fc ON fc.agent_id = a.id
     LEFT JOIN fast_resp fr ON fr.agent_id = a.id
  WHERE a.is_active = true;

-- ── agent_historical_kpis ─────────────────────────────────────────────────────
CREATE OR REPLACE VIEW agent_historical_kpis AS
 WITH closed_by_month AS (
         SELECT d.agent_id,
            date_trunc('month'::text, d.actual_close_date::timestamp with time zone)::date AS month_start,
            count(*) AS deals_closed,
            sum(COALESCE(d.commission_value, d.deal_value * COALESCE(d.commission_percentage, 3::numeric) / 100.0)) AS total_revenue
           FROM deals d
          WHERE d.stage = 'closed_won'::deal_stage AND d.actual_close_date >= (date_trunc('month'::text, now()) - '1 year 11 mons'::interval)::date AND d.actual_close_date IS NOT NULL
          GROUP BY d.agent_id, (date_trunc('month'::text, d.actual_close_date::timestamp with time zone)::date)
        ), created_by_month AS (
         SELECT deals.agent_id,
            date_trunc('month'::text, deals.created_at)::date AS month_start,
            count(*) AS total_deals
           FROM deals
          WHERE deals.created_at >= (date_trunc('month'::text, now()) - '1 year 11 mons'::interval)
            AND deals.stage <> 'nuevo_sin_contactar'::deal_stage
          GROUP BY deals.agent_id, (date_trunc('month'::text, deals.created_at)::date)
        ), activity AS (
         SELECT closed_by_month.agent_id,
            closed_by_month.month_start
           FROM closed_by_month
        UNION
         SELECT created_by_month.agent_id,
            created_by_month.month_start
           FROM created_by_month
        )
 SELECT a.id AS agent_id,
    a.full_name,
    act.month_start AS month,
    EXTRACT(year FROM act.month_start)::integer AS year,
    COALESCE(cl.deals_closed, 0::bigint) AS deals_closed,
    COALESCE(cl.total_revenue, 0::numeric) AS total_revenue,
    COALESCE(cr.total_deals, 0::bigint) AS total_deals,
        CASE
            WHEN COALESCE(cl.deals_closed, 0::bigint) = 0 THEN NULL::numeric
            ELSE round(cl.total_revenue / cl.deals_closed::numeric, 0)
        END AS avg_ticket_value
   FROM activity act
     JOIN agents a ON a.id = act.agent_id
     LEFT JOIN closed_by_month cl ON cl.agent_id = act.agent_id AND cl.month_start = act.month_start
     LEFT JOIN created_by_month cr ON cr.agent_id = act.agent_id AND cr.month_start = act.month_start
  ORDER BY a.full_name, act.month_start DESC;
