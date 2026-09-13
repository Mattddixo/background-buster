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

export const cropSpecSchema = z
  .object({
    rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
    flipH: z.boolean(),
    flipV: z.boolean(),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0.01).max(1),
    height: z.number().min(0.01).max(1),
  })
  .refine((v) => v.x + v.width <= 1.001, { message: 'Crop x + width exceeds the image bounds.' })
  .refine((v) => v.y + v.height <= 1.001, { message: 'Crop y + height exceeds the image bounds.' });

export const collageLayoutQuerySchema = z.object({
  count: z.coerce.number().int().min(1).max(9),
  width: z.coerce.number().int().positive(),
  height: z.coerce.number().int().positive(),
  gutter: z.coerce.number().int().min(0).max(100).optional(),
});

export const generateRequestSchema = z.object({
  seed: z.string().min(1).max(200),
  width: z.coerce.number().int().positive(),
  height: z.coerce.number().int().positive(),
  format: outputFormatSchema.optional(),
  quality: z.coerce.number().int().min(1).max(100).optional(),
});
