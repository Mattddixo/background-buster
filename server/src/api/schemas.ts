import { z } from 'zod';

export const fitModeSchema = z.enum(['cover', 'contain-blur', 'contain-pad']);
export const outputFormatSchema = z.enum(['png', 'jpeg', 'webp']);

export const targetSchema = z
  .object({
    presetId: z.string().optional(),
    width: z.coerce.number().int().positive().optional(),
    height: z.coerce.number().int().positive().optional(),
  })
  .refine((v) => Boolean(v.presetId) || Boolean(v.width && v.height), {
    message: 'Provide either presetId or both width and height.',
  });

export const processOptionsSchema = z.object({
  mode: fitModeSchema.default('cover'),
  allowUpscale: z.coerce.boolean().default(false),
  format: outputFormatSchema.optional(),
  quality: z.coerce.number().int().min(1).max(100).optional(),
  padColor: z.string().optional(),
});

export const collageOptionsSchema = z.object({
  allowUpscale: z.coerce.boolean().default(false),
  gutter: z.coerce.number().int().min(0).max(100).optional(),
  gutterColor: z.string().optional(),
  format: outputFormatSchema.optional(),
  quality: z.coerce.number().int().min(1).max(100).optional(),
});

export const generateRequestSchema = z.object({
  seed: z.string().min(1).max(200),
  width: z.coerce.number().int().positive(),
  height: z.coerce.number().int().positive(),
  format: outputFormatSchema.optional(),
  quality: z.coerce.number().int().min(1).max(100).optional(),
});
