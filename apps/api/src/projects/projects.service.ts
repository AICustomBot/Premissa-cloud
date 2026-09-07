import {
  ForbiddenException,
  Injectable,
  PreconditionFailedException,
} from "@nestjs/common";
import {
  AuditLogEntry,
  CanonicalEntity,
  ConfirmEntitiesRequest,
  CreateProjectRequest,
  generateUuidV7,
  MergeEntitiesRequest,
  Organization,
  PatchEntityRequest,
  Project,
  ProjectGrant,
  Role,
  ScriptVersion,
  SourceType,
} from "@permissa/contracts";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { FirestoreService } from "../storage/firestore.service.js";

@Injectable()
export class ProjectsService {
  constructor(private readonly firestoreService: FirestoreService) {
    // Bootstrap initial organization seed
    const defaultOrgId = generateUuidV7();
    const defaultOrg: Organization = {
      id: defaultOrgId,
      name: "Apex Pictures Entertainment",
      ownerId: "user-owner-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    void this.firestoreService.saveOrganization(defaultOrg);
  }

  async getPrimaryOrgIdForUser(user: AuthenticatedUser): Promise<string> {
    if (user.organizationId) {
      const existing = await this.firestoreService.getOrganization(
        user.organizationId,
      );
      if (existing) return existing.id;
    }

    // Find organization owned by user
    const allOrgs = await this.firestoreService.listOrganizations();
    for (const org of allOrgs) {
      if (org.ownerId === user.uid) return org.id;
    }

    // Auto-bootstrap organization for new user
    const newOrgId = generateUuidV7();
    const now = new Date().toISOString();
    const newOrg: Organization = {
      id: newOrgId,
      name: `${user.email.split("@")[0]}'s Studio`,
      ownerId: user.uid,
      createdAt: now,
      updatedAt: now,
    };
    await this.firestoreService.saveOrganization(newOrg);
    return newOrgId;
  }

  // ==========================================
  // Project Management & Tenant Guards
  // ==========================================

  async createProject(
    user: AuthenticatedUser,
    dto: CreateProjectRequest,
  ): Promise<Project> {
    const validated = CreateProjectRequest.parse(dto);

    // Verify tenant boundary: user must own or belong to the organization
    const org = await this.firestoreService.getOrganization(
      validated.organizationId,
    );
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

    await this.firestoreService.saveProject(project);

    // Grant OWNER role to the creator
    const creatorGrant: ProjectGrant = {
      projectId,
      userId: user.uid,
      role: "OWNER",
      grantedAt: now,
    };
    await this.firestoreService.saveGrant(creatorGrant);

    // Record content-free audit entry
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
    await this.firestoreService.appendAuditLog(auditEntry);

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
    const allProjects = await this.firestoreService.listProjects();
    const allowedProjects: Project[] = [];

    for (const project of allProjects) {
      if (project.deletedAt !== null) continue;

      // Check grants or org ownership
      const grants = await this.firestoreService.getGrants(project.id);
      const hasGrant = grants.some((g) => g.userId === user.uid);
      const org = await this.firestoreService.getOrganization(
        project.organizationId,
      );
      const isOrgOwner = org?.ownerId === user.uid;

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
    const project = await this.firestoreService.getProject(projectId);
    if (!project || (!includeDeleted && project.deletedAt !== null)) {
      throw new ForbiddenException("FORBIDDEN");
    }

    await this.assertProjectAccess(user, project, [
      "OWNER",
      "PRODUCER",
      "REVIEWER",
    ]);
    return project;
  }

  async deleteProject(
    user: AuthenticatedUser,
    projectId: string,
  ): Promise<void> {
    const project = await this.firestoreService.getProject(projectId);
    if (!project || project.deletedAt !== null) {
      throw new ForbiddenException("FORBIDDEN");
    }

    // Deletion strictly requires OWNER role
    await this.assertProjectAccess(user, project, ["OWNER"]);

    const now = new Date().toISOString();
    const updatedProject: Project = {
      ...project,
      deletedAt: now,
      version: project.version + 1,
      updatedAt: now,
    };

    await this.firestoreService.saveProject(updatedProject, project.version);

    // Record content-free audit entry
    const auditEntry: AuditLogEntry = {
      id: generateUuidV7(),
      organizationId: project.organizationId,
      projectId,
      actorId: user.uid,
      action: "PROJECT_DELETED",
      timestamp: now,
      metadata: {
        version: updatedProject.version,
      },
    };
    await this.firestoreService.appendAuditLog(auditEntry);
  }

  async grantRole(
    user: AuthenticatedUser,
    projectId: string,
    targetUserId: string,
    role: "OWNER" | "PRODUCER" | "REVIEWER",
  ): Promise<ProjectGrant> {
    const project = await this.getProject(user, projectId);
    await this.assertProjectAccess(user, project, ["OWNER"]);

    const now = new Date().toISOString();
    const newGrant: ProjectGrant = {
      projectId,
      userId: targetUserId,
      role,
      grantedAt: now,
    };

    await this.firestoreService.saveGrant(newGrant);

    const auditEntry: AuditLogEntry = {
      id: generateUuidV7(),
      organizationId: project.organizationId,
      projectId,
      actorId: user.uid,
      action: "GRANT_CREATED",
      timestamp: now,
      metadata: { role },
    };
    await this.firestoreService.appendAuditLog(auditEntry);

    return newGrant;
  }

  async getAuditLogs(
    user: AuthenticatedUser,
    projectId: string,
  ): Promise<AuditLogEntry[]> {
    await this.getProject(user, projectId, true);
    return this.firestoreService.getAuditLogs(projectId);
  }

  // ==========================================
  // Scripts Persistence & Tenant Guards
  // ==========================================

  async createScriptVersion(
    user: AuthenticatedUser,
    projectId: string,
    data: {
      sourceType: (typeof SourceType)["_type"];
      checksumSha256: string;
      pageCount: number;
      sceneCount: number;
    },
  ): Promise<ScriptVersion> {
    const project = await this.getProject(user, projectId);
    await this.assertProjectAccess(user, project, ["OWNER", "PRODUCER"]);

    const scriptVersionId = generateUuidV7();
    const now = new Date().toISOString();
    const existingScripts =
      await this.firestoreService.listScriptVersions(projectId);

    const scriptVersion: ScriptVersion = {
      id: scriptVersionId,
      projectId,
      sourceType: data.sourceType,
      checksumSha256: data.checksumSha256,
      pageCount: data.pageCount,
      versionNumber: existingScripts.length + 1,
      sceneCount: data.sceneCount,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    await this.firestoreService.saveScriptVersion(scriptVersion);

    // Audit log (content-free: only metadata counters, no script body)
    await this.firestoreService.appendAuditLog({
      id: generateUuidV7(),
      organizationId: project.organizationId,
      projectId,
      actorId: user.uid,
      action: "SCRIPT_VERSION_CREATED",
      timestamp: now,
      metadata: {
        pageCount: data.pageCount,
        sceneCount: data.sceneCount,
        versionNumber: scriptVersion.versionNumber,
      },
    });

    return scriptVersion;
  }

  async getScriptVersion(
    user: AuthenticatedUser,
    projectId: string,
    scriptVersionId: string,
  ): Promise<ScriptVersion> {
    const project = await this.getProject(user, projectId);
    await this.assertProjectAccess(user, project, [
      "OWNER",
      "PRODUCER",
      "REVIEWER",
    ]);

    const script = await this.firestoreService.getScriptVersion(
      projectId,
      scriptVersionId,
    );
    if (!script) {
      throw new ForbiddenException("FORBIDDEN");
    }
    return script;
  }

  // ==========================================
  // Entities Persistence & Tenant Guards
  // ==========================================

  async createEntity(
    user: AuthenticatedUser,
    projectId: string,
    scriptVersionId: string,
    data: Omit<
      CanonicalEntity,
      "id" | "scriptVersionId" | "version" | "createdAt" | "updatedAt"
    >,
  ): Promise<CanonicalEntity> {
    const project = await this.getProject(user, projectId);
    await this.assertProjectAccess(user, project, ["OWNER", "PRODUCER"]);

    const entityId = generateUuidV7();
    const now = new Date().toISOString();

    const entity: CanonicalEntity = {
      ...data,
      id: entityId,
      scriptVersionId,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    await this.firestoreService.saveEntity(entity);
    return entity;
  }

  async getEntity(
    user: AuthenticatedUser,
    projectId: string,
    scriptVersionId: string,
    entityId: string,
  ): Promise<CanonicalEntity> {
    const project = await this.getProject(user, projectId);
    await this.assertProjectAccess(user, project, [
      "OWNER",
      "PRODUCER",
      "REVIEWER",
    ]);

    const entities = await this.firestoreService.listEntities(scriptVersionId);
    const entity = entities.find((e) => e.id === entityId);
    if (!entity) {
      throw new ForbiddenException("FORBIDDEN");
    }
    return entity;
  }

  async patchEntity(
    user: AuthenticatedUser,
    projectId: string,
    scriptVersionId: string,
    entityId: string,
    patch: {
      expectedVersion: number;
      canonicalName?: string;
      type?: CanonicalEntity["type"];
      aliases?: string[];
    },
  ): Promise<CanonicalEntity> {
    const project = await this.getProject(user, projectId);
    await this.assertProjectAccess(user, project, ["OWNER", "PRODUCER"]);

    const entity = await this.getEntity(
      user,
      projectId,
      scriptVersionId,
      entityId,
    );
    if (entity.version !== patch.expectedVersion) {
      throw new PreconditionFailedException("VERSION_CONFLICT");
    }

    const now = new Date().toISOString();
    const updated: CanonicalEntity = {
      ...entity,
      canonicalName: patch.canonicalName ?? entity.canonicalName,
      type: patch.type ?? entity.type,
      aliases: patch.aliases ?? entity.aliases,
      version: entity.version + 1,
      updatedAt: now,
    };

    await this.firestoreService.saveEntity(updated, patch.expectedVersion);
    return updated;
  }

  /**
   * Producer confirmation gate: Only PRODUCER or OWNER can confirm entities.
   * Required before any clearance research may execute.
   */
  async confirmEntities(
    user: AuthenticatedUser,
    projectId: string,
    scriptVersionId: string,
    entityIds: string[],
  ): Promise<{ confirmedCount: number }> {
    const project = await this.getProject(user, projectId);
    // Explicitly enforce PRODUCER or OWNER role
    await this.assertProjectAccess(user, project, ["OWNER", "PRODUCER"]);

    const entities = await this.firestoreService.listEntities(scriptVersionId);
    let count = 0;

    for (const id of entityIds) {
      const entity = entities.find((e) => e.id === id);
      if (entity && !entity.confirmed) {
        const now = new Date().toISOString();
        const updated: CanonicalEntity = {
          ...entity,
          confirmed: true,
          version: entity.version + 1,
          updatedAt: now,
        };
        await this.firestoreService.saveEntity(updated, entity.version);
        count++;
      }
    }

    // Content-free audit entry
    await this.firestoreService.appendAuditLog({
      id: generateUuidV7(),
      organizationId: project.organizationId,
      projectId,
      actorId: user.uid,
      action: "ENTITIES_CONFIRMED",
      timestamp: new Date().toISOString(),
      metadata: {
        confirmedCount: count,
      },
    });

    return { confirmedCount: count };
  }

  async listEntities(
    user: AuthenticatedUser,
    projectId: string,
    scriptVersionId: string,
  ): Promise<CanonicalEntity[]> {
    const project = await this.getProject(user, projectId);
    await this.assertProjectAccess(user, project, [
      "OWNER",
      "PRODUCER",
      "REVIEWER",
      "REVIEWER",
    ]);

    return this.firestoreService.listEntities(scriptVersionId);
  }

  async mergeEntities(
    user: AuthenticatedUser,
    projectId: string,
    scriptVersionId: string,
    dto: any,
  ): Promise<CanonicalEntity> {
    const project = await this.getProject(user, projectId);
    await this.assertProjectAccess(user, project, ["OWNER", "PRODUCER"]);

    const validated = dto;
    const entities = await this.firestoreService.listEntities(scriptVersionId);

    const survivor = entities.find((e) => e.id === validated.survivorId);
    if (!survivor) {
      throw new ForbiddenException("SURVIVOR_NOT_FOUND");
    }

    const expectedSurvivorVersion = validated.expectedVersions[survivor.id];
    if (
      expectedSurvivorVersion !== undefined &&
      survivor.version !== expectedSurvivorVersion
    ) {
      throw new PreconditionFailedException("VERSION_CONFLICT");
    }

    const mergedEntities: CanonicalEntity[] = [];
    for (const mergedId of validated.mergedIds) {
      if (mergedId === survivor.id) continue;
      const mEntity = entities.find((e) => e.id === mergedId);
      if (!mEntity) {
        throw new ForbiddenException("MERGED_ENTITY_NOT_FOUND");
      }
      const expVer = validated.expectedVersions[mergedId];
      if (expVer !== undefined && mEntity.version !== expVer) {
        throw new PreconditionFailedException("VERSION_CONFLICT");
      }
      mergedEntities.push(mEntity);
    }

    // Accumulate aliases
    const aliasSet = new Set<string>(survivor.aliases);
    for (const m of mergedEntities) {
      aliasSet.add(m.canonicalName);
      for (const a of m.aliases) {
        aliasSet.add(a);
      }
    }
    // Remove self if present
    aliasSet.delete(survivor.canonicalName);
    const combinedAliases = Array.from(aliasSet).slice(0, 20);

    // Accumulate mentions
    const combinedMentions = [...survivor.mentions];
    for (const m of mergedEntities) {
      combinedMentions.push(...m.mentions);
    }

    const now = new Date().toISOString();
    const updatedSurvivor: CanonicalEntity = {
      ...survivor,
      aliases: combinedAliases,
      mentions: combinedMentions,
      version: survivor.version + 1,
      updatedAt: now,
    };

    // Save survivor with incremented version
    await this.firestoreService.saveEntity(updatedSurvivor, survivor.version);

    // Delete merged records
    for (const m of mergedEntities) {
      await this.firestoreService.deleteEntity(scriptVersionId, m.id);
    }

    // Content-free audit log
    await this.firestoreService.appendAuditLog({
      id: generateUuidV7(),
      organizationId: project.organizationId,
      projectId,
      actorId: user.uid,
      action: "ENTITIES_MERGED",
      timestamp: now,
      metadata: {
        survivorId: survivor.id,
        mergedCount: mergedEntities.length,
      },
    });

    return updatedSurvivor;
  }

  // ==========================================
  // Authorization Helper
  // ==========================================

  public async assertProjectAccess(
    user: AuthenticatedUser,
    project: Project,
    allowedRoles: Array<(typeof Role)["_type"]>,
  ): Promise<void> {
    const org = await this.firestoreService.getOrganization(
      project.organizationId,
    );
    const isOrgOwner = org?.ownerId === user.uid;

    if (isOrgOwner) {
      return; // Organization owner has full administrative clearance
    }

    const grants = await this.firestoreService.getGrants(project.id);
    const grant = grants.find((g) => g.userId === user.uid);

    if (!grant || !allowedRoles.includes(grant.role)) {
      throw new ForbiddenException("FORBIDDEN");
    }
  }
}
