import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  executeParallelResearch,
  ParallelResearchRequestSchema,
} from "../../../../lib/parallel-service";

export async function POST(req: NextRequest) {
  const correlationId = `corr_${crypto.randomUUID().slice(0, 8)}`;

  try {
    const body = await req.json();
    const parseResult = ParallelResearchRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          type: "https://permissa.app/errors/VALIDATION_FAILED",
          title: "Invalid Research Request",
          status: 400,
          detail: "The research request body failed schema validation.",
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

    const result = await executeParallelResearch(parseResult.data);
    return NextResponse.json({
      success: true,
      correlationId,
      data: result,
    });
  } catch (error: any) {
    if (error?.code === "PARALLEL_UNAVAILABLE") {
      return NextResponse.json(
        {
          type: "https://permissa.app/errors/PARALLEL_UNAVAILABLE",
          title: "Parallel Search API Unavailable",
          status: 503,
          detail:
            "Parallel API key is not configured or the upstream service is temporarily unreachable. Configure PARALLEL_API_KEY to enable live web and registry research.",
          code: "PARALLEL_UNAVAILABLE",
          correlationId,
          retryable: true,
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        type: "https://permissa.app/errors/RESEARCH_FAILED",
        title: "Research Execution Failed",
        status: 500,
        detail: "An unexpected error occurred during research execution.",
        code: "RESEARCH_FAILED",
        correlationId,
        retryable: true,
      },
      { status: 500 },
    );
  }
}
