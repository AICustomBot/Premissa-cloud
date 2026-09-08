import { NextResponse } from "next/server";
import { isParallelConfigured } from "../../../../lib/parallel-service";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    provider: "Parallel Web Systems",
    apiHost: "api.parallel.ai",
    endpoint: "https://api.parallel.ai/v1/search",
    configured: isParallelConfigured(),
    policyVersion: "2026-09-01",
    modelSupported: "v1/search",
    rateLimits: {
      entityParallelCallCap: Number(process.env.ENTITY_PARALLEL_CALL_CAP || 3),
      runParallelCallCap: Number(process.env.RUN_PARALLEL_CALL_CAP || 30),
    },
  });
}
