import { describe, expect, it } from "vitest";
import {
  ForbiddenException,
  PreconditionFailedException,
  UnauthorizedException,
} from "@nestjs/common";
import { generateUuidV7 } from "@permissa/contracts";
import { AuthService } from "../src/auth/auth.service.js";
import { ProjectsService } from "../src/projects/projects.service.js";
import type { AuthenticatedUser } from "../src/auth/auth.types.js";

describe("Tranche 1 & Batch 1: Multi-Tenant Authorization & Persistence Integration", () => {
  const authService = new AuthService();
  const projectsService = new ProjectsService();

  const userStudioA_Owner: AuthenticatedUser = {
    uid: "user-owner-a",
    email: "owner@studio-a.com",
    organizationId: "org-a",
    defaultRole: "OWNER",
  };

  const userStudioA_Producer: AuthenticatedUser = {
    uid: "user-producer-a",
    email: "producer@studio-a.com",
    organizationId: "org-a",
    defaultRole: "PRODUCER",
  };

  const userStudioA_Reviewer: AuthenticatedUser = {
    uid: "user-reviewer-a",
    email: "reviewer@studio-a.com",
    organizationId: "org-a",
    defaultRole: "REVIEWER",
  };

  const userStudioB_Owner: AuthenticatedUser = {
    uid: "user-owner-b",
    email: "owner@studio-b.com",
    organizationId: "org-b",
    defaultRole: "OWNER",
  };

  // 1. Authentication Gate
  it("fails unauthenticated requests with AUTH_REQUIRED", async () => {
    await expect(authService.verifyToken()).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(authService.verifyToken("")).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(authService.verifyToken("Basic 12345")).rejects.toThrow(
      UnauthorizedException,
    );
  });

  // 2. Multi-Tenant Project Creation & Grants
  it("creates a project in User A's organization and issues an OWNER grant in persistent store", async () => {
    const orgIdA = await projectsService.getPrimaryOrgIdForUser(userStudioA_Owner);

    const project = await projectsService.createProject(userStudioA_Owner, {
      organizationId: orgIdA,
      title: "Operation Darkstar",
      jurisdiction: "US",
    });

    expect(project.id).toBeDefined();
    expect(project.title).toBe("Operation Darkstar");
    expect(project.createdBy).toBe(userStudioA_Owner.uid);
    expect(project.deletedAt).toBeNull();
    expect(project.version).toBe(1);
  });

  // 3. Cross-Tenant Write Protection
  it("blocks cross-tenant write: User B cannot create a project inside User A's organization", async () => {
    const orgIdA = await projectsService.getPrimaryOrgIdForUser(userStudioA_Owner);

    await expect(
      projectsService.createProject(userStudioB_Owner, {
        organizationId: orgIdA,
        title: "Malicious Cross-Tenant Project",
        jurisdiction: "US",
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  // 4. Cross-Tenant Read Protection
  it("blocks cross-tenant read: User B cannot get or view User A's project", async () => {
    const orgIdA = await projectsService.getPrimaryOrgIdForUser(userStudioA_Owner);
    const project = await projectsService.createProject(userStudioA_Owner, {
      organizationId: orgIdA,
      title: "Confidential Script A",
      jurisdiction: "US",
    });

    // Tenant owner can read
    const fetched = await projectsService.getProject(
      userStudioA_Owner,
      project.id,
    );
    expect(fetched.id).toBe(project.id);

    // Cross-tenant user is forbidden
    await expect(
      projectsService.getProject(userStudioB_Owner, project.id),
    ).rejects.toThrow(ForbiddenException);
  });

  // 5. Tenant Query Isolation
  it("omits cross-tenant projects from list queries", async () => {
    const orgIdB = await projectsService.getPrimaryOrgIdForUser(userStudioB_Owner);
    await projectsService.createProject(userStudioB_Owner, {
      organizationId: orgIdB,
      title: "Studio B Independent Film",
      jurisdiction: "US",
    });

    const listA = await projectsService.listProjects(userStudioA_Owner);
    const listB = await projectsService.listProjects(userStudioB_Owner);

    // List A must contain zero projects from Studio B
    expect(listA.items.some((p) => p.organizationId === orgIdB)).toBe(false);
    // List B must contain Studio B's project
    expect(listB.items.some((p) => p.organizationId === orgIdB)).toBe(true);
  });

  // 6. Role-Based Deletion & Cross-Tenant Deletion Protection
  it("blocks non-owner deletion: PRODUCER and cross-tenant users cannot delete a project", async () => {
    const orgIdA = await projectsService.getPrimaryOrgIdForUser(userStudioA_Owner);
    const project = await projectsService.createProject(userStudioA_Owner, {
      organizationId: orgIdA,
      title: "Producer Collaboration",
      jurisdiction: "US",
    });

    // Grant PRODUCER to userStudioA_Producer
    await projectsService.grantRole(
      userStudioA_Owner,
      project.id,
      userStudioA_Producer.uid,
      "PRODUCER",
    );

    // Producer cannot delete project
    await expect(
      projectsService.deleteProject(userStudioA_Producer, project.id),
    ).rejects.toThrow(ForbiddenException);

    // Cross-tenant user cannot delete project
    await expect(
      projectsService.deleteProject(userStudioB_Owner, project.id),
    ).rejects.toThrow(ForbiddenException);
  });

  // 7. Owner Soft-Deletion with Version Bump & Content-Free Audit Logging
  it("allows OWNER deletion with monotonic version bump and content-free audit logging", async () => {
    const orgIdA = await projectsService.getPrimaryOrgIdForUser(userStudioA_Owner);
    const project = await projectsService.createProject(userStudioA_Owner, {
      organizationId: orgIdA,
      title: "Project to Retire",
      jurisdiction: "US",
    });

    await projectsService.deleteProject(userStudioA_Owner, project.id);

    // Soft-deleted project subsequent reads are forbidden
    await expect(
      projectsService.getProject(userStudioA_Owner, project.id),
    ).rejects.toThrow(ForbiddenException);

    // Audit log records deletion with content-free metadata
    const auditLogs = await projectsService.getAuditLogs(
      userStudioA_Owner,
      project.id,
    );
    expect(auditLogs.length).toBeGreaterThanOrEqual(2); // CREATED + DELETED

    const deleteAudit = auditLogs.find((l) => l.action === "PROJECT_DELETED");
    expect(deleteAudit).toBeDefined();
    expect(deleteAudit?.actorId).toBe(userStudioA_Owner.uid);

    // Strict constitution rule: content-free logging (no script title in metadata)
    const metadataStr = JSON.stringify(deleteAudit?.metadata);
    expect(metadataStr).not.toContain("Project to Retire");
  });

  // 8. Scripts Persistence & Multi-Tenant Isolation
  it("enforces tenant isolation and role restrictions on script version persistence", async () => {
    const orgIdA = await projectsService.getPrimaryOrgIdForUser(userStudioA_Owner);
    const project = await projectsService.createProject(userStudioA_Owner, {
      organizationId: orgIdA,
      title: "Script Upload Project",
      jurisdiction: "US",
    });

    // Grant PRODUCER to producer-a
    await projectsService.grantRole(
      userStudioA_Owner,
      project.id,
      userStudioA_Producer.uid,
      "PRODUCER",
    );

    // Producer can upload script version
    const script = await projectsService.createScriptVersion(
      userStudioA_Producer,
      project.id,
      {
        sourceType: "PDF",
        checksumSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        pageCount: 15,
        sceneCount: 22,
      },
    );

    expect(script.id).toBeDefined();
    expect(script.versionNumber).toBe(1);
    expect(script.pageCount).toBe(15);

    // Cross-tenant user B cannot read script version
    await expect(
      projectsService.getScriptVersion(userStudioB_Owner, project.id, script.id),
    ).rejects.toThrow(ForbiddenException);

    // Cross-tenant user B cannot create script version in Project A
    await expect(
      projectsService.createScriptVersion(userStudioB_Owner, project.id, {
        sourceType: "PDF",
        checksumSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        pageCount: 10,
        sceneCount: 12,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  // 9. Entities Persistence, Version Preconditions & Concurrency Protection
  it("enforces tenant isolation and version preconditions on canonical entities", async () => {
    const orgIdA = await projectsService.getPrimaryOrgIdForUser(userStudioA_Owner);
    const project = await projectsService.createProject(userStudioA_Owner, {
      organizationId: orgIdA,
      title: "Entity Management Project",
      jurisdiction: "US",
    });

    const script = await projectsService.createScriptVersion(
      userStudioA_Owner,
      project.id,
      {
        sourceType: "PDF",
        checksumSha256: "11b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        pageCount: 12,
        sceneCount: 18,
      },
    );

    // Create canonical entity
    const sceneId1 = generateUuidV7();
    const entity = await projectsService.createEntity(
      userStudioA_Owner,
      project.id,
      script.id,
      {
        canonicalName: "St. Jude Hospital",
        type: "BRAND_BUSINESS_PRODUCT",
        aliases: ["St. Jude's", "County Clinic"],
        mentions: [
          {
            sceneId: sceneId1,
            sourceRange: { start: 100, end: 120 },
            contextExcerpt: "exterior shot of the hospital entrance",
          },
        ],
        confirmed: false,
      },
    );

    expect(entity.id).toBeDefined();
    expect(entity.version).toBe(1);
    expect(entity.confirmed).toBe(false);

    // Cross-tenant read is blocked
    await expect(
      projectsService.getEntity(userStudioB_Owner, project.id, script.id, entity.id),
    ).rejects.toThrow(ForbiddenException);

    // Cross-tenant patch is blocked
    await expect(
      projectsService.patchEntity(userStudioB_Owner, project.id, script.id, entity.id, {
        expectedVersion: 1,
        canonicalName: "Hacked Name",
      }),
    ).rejects.toThrow(ForbiddenException);

    // Stale version precondition must fail with VERSION_CONFLICT (412)
    await expect(
      projectsService.patchEntity(userStudioA_Owner, project.id, script.id, entity.id, {
        expectedVersion: 999, // stale version
        canonicalName: "New Name",
      }),
    ).rejects.toThrow(PreconditionFailedException);

    // Valid version precondition succeeds and bumps version
    const patched = await projectsService.patchEntity(
      userStudioA_Owner,
      project.id,
      script.id,
      entity.id,
      {
        expectedVersion: 1,
        canonicalName: "St. Jude Memorial Hospital",
      },
    );

    expect(patched.canonicalName).toBe("St. Jude Memorial Hospital");
    expect(patched.version).toBe(2);
  });

  // 10. Producer Confirmation Gate
  it("enforces the producer confirmation gate before research is permitted", async () => {
    const orgIdA = await projectsService.getPrimaryOrgIdForUser(userStudioA_Owner);
    const project = await projectsService.createProject(userStudioA_Owner, {
      organizationId: orgIdA,
      title: "Confirmation Gate Project",
      jurisdiction: "US",
    });

    // Grant REVIEWER to userStudioA_Reviewer
    await projectsService.grantRole(
      userStudioA_Owner,
      project.id,
      userStudioA_Reviewer.uid,
      "REVIEWER",
    );

    const script = await projectsService.createScriptVersion(
      userStudioA_Owner,
      project.id,
      {
        sourceType: "PDF",
        checksumSha256: "22b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        pageCount: 8,
        sceneCount: 10,
      },
    );

    const sceneId2 = generateUuidV7();
    const entity = await projectsService.createEntity(
      userStudioA_Owner,
      project.id,
      script.id,
      {
        canonicalName: "Acme Corporation",
        type: "BRAND_BUSINESS_PRODUCT",
        aliases: [],
        mentions: [
          {
            sceneId: sceneId2,
            sourceRange: { start: 200, end: 215 },
            contextExcerpt: "corporate lobby sign",
          },
        ],
        confirmed: false,
      },
    );

    // REVIEWER cannot confirm entities (Forbidden)
    await expect(
      projectsService.confirmEntities(
        userStudioA_Reviewer,
        project.id,
        script.id,
        [entity.id],
      ),
    ).rejects.toThrow(ForbiddenException);

    // Cross-tenant user cannot confirm entities (Forbidden)
    await expect(
      projectsService.confirmEntities(
        userStudioB_Owner,
        project.id,
        script.id,
        [entity.id],
      ),
    ).rejects.toThrow(ForbiddenException);

    // PRODUCER or OWNER can confirm entities
    const confirmResult = await projectsService.confirmEntities(
      userStudioA_Owner,
      project.id,
      script.id,
      [entity.id],
    );

    expect(confirmResult.confirmedCount).toBe(1);

    const confirmedEntity = await projectsService.getEntity(
      userStudioA_Owner,
      project.id,
      script.id,
      entity.id,
    );
    expect(confirmedEntity.confirmed).toBe(true);
    expect(confirmedEntity.version).toBe(2);

    // Content-free audit entry verification: no entity names leaked in audit metadata
    const auditLogs = await projectsService.getAuditLogs(
      userStudioA_Owner,
      project.id,
    );
    const confirmAudit = auditLogs.find((l) => l.action === "ENTITIES_CONFIRMED");
    expect(confirmAudit).toBeDefined();
    expect(JSON.stringify(confirmAudit?.metadata)).not.toContain("Acme Corporation");
  });

  // 11. Cross-Tenant Audit Log Access
  it("blocks cross-tenant audit trail inspection", async () => {
    const orgIdA = await projectsService.getPrimaryOrgIdForUser(userStudioA_Owner);
    const project = await projectsService.createProject(userStudioA_Owner, {
      organizationId: orgIdA,
      title: "Audit Protection Project",
      jurisdiction: "US",
    });

    // Cross-tenant user cannot inspect audit logs
    await expect(
      projectsService.getAuditLogs(userStudioB_Owner, project.id),
    ).rejects.toThrow(ForbiddenException);
  });

  // 12. Batch 3: Entity Deduplication, Merging & Version Preconditions
  it("merges candidate entities, unifies aliases and mentions, enforces expectedVersions, and purges merged records", async () => {
    const orgIdA = await projectsService.getPrimaryOrgIdForUser(userStudioA_Owner);
    const project = await projectsService.createProject(userStudioA_Owner, {
      organizationId: orgIdA,
      title: "Alias Consolidation Project",
      jurisdiction: "US",
    });

    const script = await projectsService.createScriptVersion(
      userStudioA_Owner,
      project.id,
      {
        sourceType: "FDX",
        checksumSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        pageCount: 10,
        sceneCount: 3,
      },
    );

    const sceneId1 = generateUuidV7();
    const sceneId2 = generateUuidV7();

    // Entity 1: Canonical character "Julian Voss"
    const survivorEntity = await projectsService.createEntity(
      userStudioA_Owner,
      project.id,
      script.id,
      {
        type: "PERSON_CHARACTER",
        canonicalName: "Julian Voss",
        aliases: ["Julian"],
        mentions: [
          {
            sceneId: sceneId1,
            sourceRange: { start: 10, end: 21 },
            contextExcerpt: "Julian Voss sits silently at the desk.",
          },
        ],
        confirmed: false,
      },
    );

    // Entity 2: Short variation "Voss"
    const aliasEntity = await projectsService.createEntity(
      userStudioA_Owner,
      project.id,
      script.id,
      {
        type: "PERSON_CHARACTER",
        canonicalName: "Voss",
        aliases: ["Agent Voss"],
        mentions: [
          {
            sceneId: sceneId2,
            sourceRange: { start: 50, end: 54 },
            contextExcerpt: "Voss stands up suddenly.",
          },
        ],
        confirmed: false,
      },
    );

    // Non-producer/non-owner cannot merge
    await expect(
      projectsService.mergeEntities(userStudioA_Reviewer, project.id, script.id, {
        survivorId: survivorEntity.id,
        mergedIds: [aliasEntity.id],
        expectedVersions: {
          [survivorEntity.id]: 1,
          [aliasEntity.id]: 1,
        },
      }),
    ).rejects.toThrow(ForbiddenException);

    // Stale version precondition failure
    await expect(
      projectsService.mergeEntities(userStudioA_Owner, project.id, script.id, {
        survivorId: survivorEntity.id,
        mergedIds: [aliasEntity.id],
        expectedVersions: {
          [survivorEntity.id]: 999, // Intentional mismatch
          [aliasEntity.id]: 1,
        },
      }),
    ).rejects.toThrow(PreconditionFailedException);

    // Successful merge by Owner/Producer
    const mergedResult = await projectsService.mergeEntities(
      userStudioA_Owner,
      project.id,
      script.id,
      {
        survivorId: survivorEntity.id,
        mergedIds: [aliasEntity.id],
        expectedVersions: {
          [survivorEntity.id]: 1,
          [aliasEntity.id]: 1,
        },
      },
    );

    expect(mergedResult.id).toBe(survivorEntity.id);
    expect(mergedResult.canonicalName).toBe("Julian Voss");
    expect(mergedResult.aliases).toContain("Julian");
    expect(mergedResult.aliases).toContain("Voss");
    expect(mergedResult.aliases).toContain("Agent Voss");
    expect(mergedResult.mentions.length).toBe(2);
    expect(mergedResult.version).toBe(2);

    // Merged record must no longer exist in the script roster
    const allEntities = await projectsService.listEntities(
      userStudioA_Owner,
      project.id,
      script.id,
    );
    expect(allEntities.find((e) => e.id === aliasEntity.id)).toBeUndefined();
    expect(allEntities.find((e) => e.id === survivorEntity.id)).toBeDefined();

    // Verify content-free audit trail for merge
    const auditLogs = await projectsService.getAuditLogs(
      userStudioA_Owner,
      project.id,
    );
    const mergeAudit = auditLogs.find((l) => l.action === "ENTITIES_MERGED");
    expect(mergeAudit).toBeDefined();
    expect(mergeAudit?.metadata.survivorId).toBe(survivorEntity.id);
    expect(mergeAudit?.metadata.mergedCount).toBe(1);
    expect(JSON.stringify(mergeAudit?.metadata)).not.toContain("Julian Voss");
    expect(JSON.stringify(mergeAudit?.metadata)).not.toContain("Voss");
  });
});
