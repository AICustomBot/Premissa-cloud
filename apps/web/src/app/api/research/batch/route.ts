import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import {
  executeParallelResearch,
  isParallelConfigured,
} from "../../../../lib/parallel-service";

const BatchResearchRequestSchema = z.object({
  projectId: z.string(),
  entities: z
    .array(
      z.object({
        entityId: z.string(),
        canonicalName: z.string().min(1),
        type: z.string(),
        jurisdiction: z.string().default("US"),
      }),
    )
    .min(1)
    .max(20),
});

export async function POST(req: NextRequest) {
  const correlationId = `corr_batch_${crypto.randomUUID().slice(0, 8)}`;

  if (!isParallelConfigured()) {
    return NextResponse.json(
      {
        type: "https://permissa.app/errors/PARALLEL_UNAVAILABLE",
        title: "Parallel Search API Unavailable",
        status: 503,
        detail:
          "Parallel API key is not configured in the application environment. Set PARALLEL_API_KEY in the platform settings to execute live web research across candidate entities.",
        code: "PARALLEL_UNAVAILABLE",
        correlationId,
        retryable: true,
      },
      { status: 503 },
    );
  }

  try {
    const body = await req.json();
    const parseResult = BatchResearchRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          type: "https://permissa.app/errors/VALIDATION_FAILED",
          title: "Invalid Batch Research Request",
          status: 400,
          detail: "The batch research request failed schema validation.",
          code: "VALIDATION_FAILED",
          correlationId,
          retryable: false,
          errors: parseResult.error.errors.map((e) => ({
            path: e.path.join("."),
            message: e.message,
          })),
        },
        { status: 400 },
      );
    }

    const { entities, projectId } = parseResult.data;
    const results = [];
    let totalCostUsd = 0;
    let totalCalls = 0;

    // Process entities with max 2 concurrent requests to respect rate limits
    for (const ent of entities) {
      try {
        const res = await executeParallelResearch({
          projectId,
          entityId: ent.entityId,
          canonicalName: ent.canonicalName,
          type: ent.type,
          jurisdiction: ent.jurisdiction,
        });
        results.push(res);
        totalCostUsd += res.usageLedgerEntry.costUsd;
        totalCalls += res.provider.callsUsed;
      } catch (err: any) {
        // Continue processing others, record failure
        results.push({
          entityId: ent.entityId,
          error: "ENTITY_RESEARCH_FAILED",
          statusCode: err.statusCode || 500,
        });
      }
    }

    return NextResponse.json({
      success: true,
      correlationId,
      summary: {
        processedCount: entities.length,
        successfulCount: results.filter((r: any) => !r.error).length,
        totalCalls,
        totalCostUsd,
      },
      results,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        type: "https://permissa.app/errors/RESEARCH_FAILED",
        title: "Batch Research Execution Failed",
        status: 500,
        detail:
          "An unexpected error occurred during batch clearance research execution.",
        code: "RESEARCH_FAILED",
        correlationId,
        retryable: true,
      },
      { status: 500 },
    );
  }
}
