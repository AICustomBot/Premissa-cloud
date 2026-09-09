import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ResearchService } from "./research.service.js";
import { UsageLedgerService } from "./ledger/usage-ledger.service.js";
import { CircuitBreaker } from "./circuit/circuit-breaker.js";
import { AuthGuard as FirebaseAuthGuard } from "../auth/auth.guard.js";

@Controller("projects/:projectId/research")
export class ResearchController {
  constructor(
    private readonly researchService: ResearchService,
    private readonly usageLedgerService: UsageLedgerService,
    private readonly circuitBreaker: CircuitBreaker,
  ) {}

  @Post("search")
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async conductSearch(
    @Param("projectId") projectId: string,
    @Body()
    body: {
      runId: string;
      entityId: string;
      jurisdiction?: "US" | "UK" | "EU" | "GLOBAL";
    },
  ) {
    return this.researchService.conductResearchForEntity({
      projectId,
      runId: body.runId,
      entityId: body.entityId,
      jurisdiction: body.jurisdiction,
    });
  }

  @Get("runs/:runId/ledger")
  @UseGuards(FirebaseAuthGuard)
  async getUsageLedger(@Param("runId") runId: string) {
    const entries = await this.usageLedgerService.getLedgerForRun(runId);
    return {
      runId,
      totalEntries: entries.length,
      totalCostUsd: Number(
        entries.reduce((sum, e) => sum + e.costUsd, 0).toFixed(4),
      ),
      entries,
    };
  }

  @Get("runs/:runId/findings")
  @UseGuards(FirebaseAuthGuard)
  async getFindings(@Param("runId") runId: string) {
    const findings = await this.researchService.getFindingsForRun(runId);
    return {
      runId,
      totalFindings: findings.length,
      findings,
    };
  }

  @Get("runs/:runId/findings/:findingId")
  @UseGuards(FirebaseAuthGuard)
  async getFinding(
    @Param("runId") runId: string,
    @Param("findingId") findingId: string,
  ) {
    return this.researchService.getFinding(runId, findingId);
  }

  @Post("runs/:runId/reevaluate")
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async reevaluateFinding(
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
    @Body()
    body: {
      entityId: string;
      riskOverrides?: any;
    },
  ) {
    return this.researchService.reevaluateFinding(
      projectId,
      runId,
      body.entityId,
      body.riskOverrides,
    );
  }

  @Get("circuit-status")
  @UseGuards(FirebaseAuthGuard)
  getCircuitStatus() {
    return {
      circuits: this.circuitBreaker.getStatus(),
    };
  }

  @Post("circuit/reset")
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  resetCircuit(@Body() body: { providerName: string }) {
    this.circuitBreaker.reset(body.providerName);
    return {
      providerName: body.providerName,
      status: "RESET_SUCCESS",
    };
  }
}
