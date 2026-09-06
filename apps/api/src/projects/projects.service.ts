import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AuditLogEntry,
  CreateProjectRequest,
  generateUuidV7,
  Organization,
  Project,
  ProjectGrant,
} from "@permissa/contracts";
import type { AuthenticatedUser } from "../auth/auth.types.js";

@Injectable()
export class ProjectsService {
  private readonly organizations = new Map<string, Organization>();
  private readonly projects = new Map<string, Project>();
  private readonly grants = new Map<string, ProjectGrant[]>(); // projectId -> grants
  private readonly auditLogs: AuditLogEntry[] = [];

  constructor() {
    // Seed default organization for initial tenant demonstration
    const defaultOrgId = generateUuidV7();
    const defaultOrg: Organization = {
      id: defaultOrgId,
      name: "Apex Pictures Entertainment",
      ownerId: "user-owner-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.organizations.set(defaultOrgId, defaultOrg);
  }

  getPrimaryOrgIdForUser(user: AuthenticatedUser): string {
    if (user.organizationId && this.organizations.has(user.organizationId)) {
      return user.organizationId;
    }
    // Find organization owned by user or return the first available
    for (const org of this.organizations.values()) {
      if (org.ownerId === user.uid) return org.id;
    }
    // Auto-bootstrap organization for new user
    const newOrgId = generateUuidV7();
    const newOrg: Organization = {
      id: newOrgId,
      name: `${user.email.split("@")[0]}'s Studio`,
      ownerId: user.uid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.organizations.set(newOrgId, newOrg);
    return newOrgId;
  }

  async createProject(
    user: AuthenticatedUser,
    dto: CreateProjectRequest,
  ): Promise<Project> {
    const validated = CreateProjectRequest.parse(dto);

    // Verify tenant membership: cannot create projects in organizations you don't belong to
    const org = this.organizations.get(validated.organizationId);
    if (!org) {
      throw new ForbiddenException("FORBIDDEN");
    }

    if (org.ownerId !== user.uid && user.organizationId !== org.id) {
      throw new ForbiddenException("FORBIDDEN");
    }

    const projectId = generateUuidV7();
    const now = new Date().toISOString();

    const project: Project = {
      id: projectId,
      organizationId: validated.organizationId,
      title: validated.title,
      jurisdiction: validated.jurisdiction,
      createdBy: user.uid,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    this.projects.set(projectId, project);

    // Grant OWNER role to the creator
    const creatorGrant: ProjectGrant = {
      projectId,
      userId: user.uid,
      role: "OWNER",
      grantedAt: now,
    };
    this.grants.set(projectId, [creatorGrant]);

    // Record immutable audit entry (content-free metadata)
    const auditEntry: AuditLogEntry = {
      id: generateUuidV7(),
      organizationId: validated.organizationId,
      projectId,
      actorId: user.uid,
      action: "PROJECT_CREATED",
      timestamp: now,
      metadata: {
        jurisdiction: validated.jurisdiction,
        titleCharCount: validated.title.length,
      },
    };
    this.auditLogs.push(auditEntry);

    return project;
  }

  async listProjects(
    user: AuthenticatedUser,
    limit = 25,
    cursor?: string,
  ): Promise<{
    items: Project[];
    page: { nextCursor: string | null; hasMore: boolean };
  }> {
    const allowedProjects: Project[] = [];

    for (const project of this.projects.values()) {
      if (project.deletedAt !== null) continue;

      // Check if user has explicit grant or is org owner
      const projectGrants = this.grants.get(project.id) ?? [];
      const hasGrant = projectGrants.some((g) => g.userId === user.uid);
      const isOrgOwner =
        this.organizations.get(project.organizationId)?.ownerId === user.uid;

      if (hasGrant || isOrgOwner) {
        allowedProjects.push(project);
      }
    }

    // Sort descending by creation date
    allowedProjects.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    let startIndex = 0;
    if (cursor) {
      const idx = allowedProjects.findIndex((p) => p.id === cursor);
      if (idx >= 0) startIndex = idx + 1;
    }

    const items = allowedProjects.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < allowedProjects.length;
    const nextCursor =
      hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return {
      items,
      page: {
        nextCursor,
        hasMore,
      },
    };
  }

  async getProject(
    user: AuthenticatedUser,
    projectId: string,
    includeDeleted = false,
  ): Promise<Project> {
    const project = this.projects.get(projectId);
    if (!project || (!includeDeleted && project.deletedAt !== null)) {
      throw new ForbiddenException("FORBIDDEN");
    }

    // Check grant
    const projectGrants = this.grants.get(projectId) ?? [];
    const hasGrant = projectGrants.some((g) => g.userId === user.uid);
    const isOrgOwner =
      this.organizations.get(project.organizationId)?.ownerId === user.uid;

    if (!hasGrant && !isOrgOwner) {
      throw new ForbiddenException("FORBIDDEN");
    }

    return project;
  }

  async deleteProject(
    user: AuthenticatedUser,
    projectId: string,
  ): Promise<void> {
    const project = this.projects.get(projectId);
    if (!project || project.deletedAt !== null) {
      throw new ForbiddenException("FORBIDDEN");
    }

    // Deletion requires OWNER role on the project
    const projectGrants = this.grants.get(projectId) ?? [];
    const userGrant = projectGrants.find((g) => g.userId === user.uid);
    const isOrgOwner =
      this.organizations.get(project.organizationId)?.ownerId === user.uid;

    const isProjectOwner = userGrant?.role === "OWNER" || isOrgOwner;

    if (!isProjectOwner) {
      throw new ForbiddenException("FORBIDDEN");
    }

    const now = new Date().toISOString();
    project.deletedAt = now;
    project.version += 1;
    project.updatedAt = now;

    // Record audit entry
    const auditEntry: AuditLogEntry = {
      id: generateUuidV7(),
      organizationId: project.organizationId,
      projectId,
      actorId: user.uid,
      action: "PROJECT_DELETED",
      timestamp: now,
      metadata: {
        version: project.version,
      },
    };
    this.auditLogs.push(auditEntry);
  }

  async grantRole(
    user: AuthenticatedUser,
    projectId: string,
    targetUserId: string,
    role: "OWNER" | "PRODUCER" | "REVIEWER",
  ): Promise<ProjectGrant> {
    const project = await this.getProject(user, projectId);
    const projectGrants = this.grants.get(projectId) ?? [];
    const userGrant = projectGrants.find((g) => g.userId === user.uid);
    const isOrgOwner =
      this.organizations.get(project.organizationId)?.ownerId === user.uid;

    if (userGrant?.role !== "OWNER" && !isOrgOwner) {
      throw new ForbiddenException("FORBIDDEN");
    }

    const now = new Date().toISOString();
    const existingIdx = projectGrants.findIndex(
      (g) => g.userId === targetUserId,
    );
    const newGrant: ProjectGrant = {
      projectId,
      userId: targetUserId,
      role,
      grantedAt: now,
    };

    if (existingIdx >= 0) {
      projectGrants[existingIdx] = newGrant;
    } else {
      projectGrants.push(newGrant);
    }
    this.grants.set(projectId, projectGrants);

    const auditEntry: AuditLogEntry = {
      id: generateUuidV7(),
      organizationId: project.organizationId,
      projectId,
      actorId: user.uid,
      action: "GRANT_CREATED",
      timestamp: now,
      metadata: { role },
    };
    this.auditLogs.push(auditEntry);

    return newGrant;
  }

  async getAuditLogs(
    user: AuthenticatedUser,
    projectId: string,
  ): Promise<AuditLogEntry[]> {
    // Must be allowed to view project (even if soft-deleted) to read audit logs
    await this.getProject(user, projectId, true);
    return this.auditLogs.filter((entry) => entry.projectId === projectId);
  }
}
