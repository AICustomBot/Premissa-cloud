import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ConfirmEntitiesRequest,
  CreateProjectRequest,
  MergeEntitiesRequest,
  PatchEntityRequest,
  Role,
} from "@permissa/contracts";
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

  @Get(":projectId/scripts/:scriptVersionId/entities")
  async listEntities(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId") projectId: string,
    @Param("scriptVersionId") scriptVersionId: string,
  ) {
    return this.projectsService.listEntities(user, projectId, scriptVersionId);
  }

  @Post(":projectId/scripts/:scriptVersionId/entities")
  @HttpCode(HttpStatus.CREATED)
  async createEntity(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId") projectId: string,
    @Param("scriptVersionId") scriptVersionId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.projectsService.createEntity(
      user,
      projectId,
      scriptVersionId,
      body as any,
    );
  }

  @Patch(":projectId/scripts/:scriptVersionId/entities/:entityId")
  async patchEntity(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId") projectId: string,
    @Param("scriptVersionId") scriptVersionId: string,
    @Param("entityId") entityId: string,
    @Body() body: unknown,
  ) {
    const dto = PatchEntityRequest.parse(body);
    return this.projectsService.patchEntity(
      user,
      projectId,
      scriptVersionId,
      entityId,
      dto,
    );
  }

  @Post(":projectId/scripts/:scriptVersionId/entities/merge")
  @HttpCode(HttpStatus.OK)
  async mergeEntities(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId") projectId: string,
    @Param("scriptVersionId") scriptVersionId: string,
    @Body() body: unknown,
  ) {
    const dto = MergeEntitiesRequest.parse(body);
    return this.projectsService.mergeEntities(
      user,
      projectId,
      scriptVersionId,
      dto,
    );
  }

  @Post(":projectId/scripts/:scriptVersionId/entities/confirm")
  @HttpCode(HttpStatus.OK)
  async confirmEntities(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId") projectId: string,
    @Param("scriptVersionId") scriptVersionId: string,
    @Body() body: unknown,
  ) {
    const dto = ConfirmEntitiesRequest.parse(body);
    return this.projectsService.confirmEntities(
      user,
      projectId,
      scriptVersionId,
      dto.confirmedEntityIds,
    );
  }
}
