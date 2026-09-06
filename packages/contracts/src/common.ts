import { z } from "zod";

export const IsoDateTime = z.string().datetime({ offset: true });

export const Versioned = z.object({
  version: z.number().int().nonnegative(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

export const PolicyVersions = z.object({
  schemaVersion: z.string(),
  evidencePolicyVersion: z.string(),
  confidenceFormulaVersion: z.string(),
  promptVersion: z.string().optional(),
});

export const PageRequest = z.object({
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).optional(),
});

export const pageOf = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.object({
      nextCursor: z.string().nullable(),
      hasMore: z.boolean(),
    }),
  });
