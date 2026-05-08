import { z } from "zod";

export const PLATFORM_VALUES = ["facebook", "instagram", "google", "tiktok", "whatsapp", "ctwa", "other"] as const;
export const STATUS_VALUES = ["active", "paused", "ended"] as const;

export const campaignCreateSchema = z.object({
  name:             z.string().min(1, "El nombre es requerido").max(200),
  platform:         z.enum(PLATFORM_VALUES),
  status:           z.enum(STATUS_VALUES).default("active"),
  start_date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  end_date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  spend:            z.number().min(0).nullable().optional(),
  leads_generated:  z.number().int().min(0).nullable().optional(),
  clicks:           z.number().int().min(0).nullable().optional(),
  impressions:      z.number().int().min(0).nullable().optional(),
});

export const campaignUpdateSchema = campaignCreateSchema.partial();

export type CampaignCreate = z.infer<typeof campaignCreateSchema>;
export type CampaignUpdate = z.infer<typeof campaignUpdateSchema>;
