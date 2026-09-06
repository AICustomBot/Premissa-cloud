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
import {
  CompareScriptVersionsRequest,
  DifferentialClearanceRunRequest,
} from "@permissa/contracts";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { DifferentialService } from "./differential.service.js";

@Controller("projects/:projectId")
@UseGuards(AuthGuard)
export class DifferentialController {
  constructor(private readonly differentialService: DifferentialService) {}

  @Post("scripts/diff")
  @HttpCode(HttpStatus.OK)
  async compareScriptVersions(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId") projectId: string,
    @Body() body: unknown,
  ) {
    const dto = CompareScriptVersionsRequest.parse(body);
    return this.differentialService.compareScriptVersions(user, projectId, dto);
  }

  @Post("runs/differential")
  @HttpCode(HttpStatus.CREATED)
  async executeDifferentialRun(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId") projectId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const dto = DifferentialClearanceRunRequest.parse({
      ...body,
      projectId,
    });
    return this.differentialService.executeDifferentialClearanceRun(user, dto);
  }

  @Get("scripts/history")
  async getScriptHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId") projectId: string,
  ) {
    return this.differentialService.getScriptDraftHistory(user, projectId);
  }
}
