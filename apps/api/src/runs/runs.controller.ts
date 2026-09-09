import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { RunsService } from "./runs.service.js";

/**
 * Clearance run endpoints.
 *
 * Findings, the usage ledger and report generation are all addressed by runId,
 * so without these a client could not reach any of them.
 */
@Controller("projects/:projectId/runs")
@UseGuards(AuthGuard)
export class RunsController {
  constructor(private readonly runsService: RunsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId") projectId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.runsService.createRun(user, projectId, body ?? {});
  }

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId") projectId: string,
  ) {
    const runs = await this.runsService.listRuns(user, projectId);
    return { projectId, total: runs.length, runs };
  }

  @Get(":runId")
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
  ) {
    return this.runsService.getRun(user, projectId, runId);
  }

  /**
   * Runs the research pipeline over the run's confirmed entities.
   *
   * 200 rather than 202: the work happens inside this request, and a 202 would
   * imply a queue that does not exist. The response reports whether work
   * remains, in which case the client calls this again to resume.
   */
  @Post(":runId/execute")
  @HttpCode(HttpStatus.OK)
  async execute(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
  ) {
    return this.runsService.executeRun(user, projectId, runId);
  }
}
