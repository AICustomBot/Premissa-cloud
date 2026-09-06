import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CreateProjectRequest, Role } from "@permissa/contracts";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { ProjectsService } from "./projects.service.js";

@Controller("projects")
@UseGuards(AuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    // If organizationId is not provided, associate with user's primary organization
    const orgId =
      (body.organizationId as string) ||
      this.projectsService.getPrimaryOrgIdForUser(user);

    const dto = CreateProjectRequest.parse({
      ...body,
      organizationId: orgId,
    });

    return this.projectsService.createProject(user, dto);
  }

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string,
  ) {
    const parsedLimit = limit ? Math.min(Math.max(Number(limit), 1), 100) : 25;
    return this.projectsService.listProjects(user, parsedLimit, cursor);
  }

  @Get(":projectId")
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId") projectId: string,
  ) {
    return this.projectsService.getProject(user, projectId);
  }

  @Delete(":projectId")
  @HttpCode(HttpStatus.ACCEPTED)
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId") projectId: string,
  ) {
    await this.projectsService.deleteProject(user, projectId);
    return {
      status: "ACCEPTED",
      message: "Deletion accepted; cascade scheduled",
    };
  }

  @Get(":projectId/audit")
  async getAudit(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId") projectId: string,
  ) {
    return this.projectsService.getAuditLogs(user, projectId);
  }

  @Post(":projectId/grants")
  @HttpCode(HttpStatus.CREATED)
  async addGrant(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId") projectId: string,
    @Body() body: { userId: string; role: (typeof Role)["_type"] },
  ) {
    return this.projectsService.grantRole(
      user,
      projectId,
      body.userId,
      body.role,
    );
  }
}
