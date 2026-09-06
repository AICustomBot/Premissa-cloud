import { describe, expect, it } from "vitest";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "../src/auth/auth.service.js";
import { ProjectsService } from "../src/projects/projects.service.js";
import type { AuthenticatedUser } from "../src/auth/auth.types.js";

describe("Tranche 1: Authorization & Multi-Tenant Isolation", () => {
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

  const userStudioB_Owner: AuthenticatedUser = {
    uid: "user-owner-b",
    email: "owner@studio-b.com",
    organizationId: "org-b",
    defaultRole: "OWNER",
  };

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

  it("creates a project in User A's organization and issues an OWNER grant", async () => {
    const orgIdA = projectsService.getPrimaryOrgIdForUser(userStudioA_Owner);

    const project = await projectsService.createProject(userStudioA_Owner, {
      organizationId: orgIdA,
      title: "Operation Darkstar",
      jurisdiction: "US",
    });

    expect(project.id).toBeDefined();
    expect(project.title).toBe("Operation Darkstar");
    expect(project.createdBy).toBe(userStudioA_Owner.uid);
    expect(project.deletedAt).toBeNull();
  });

  it("blocks cross-tenant write: User B cannot create a project inside User A's organization", async () => {
    const orgIdA = projectsService.getPrimaryOrgIdForUser(userStudioA_Owner);

    await expect(
      projectsService.createProject(userStudioB_Owner, {
        organizationId: orgIdA,
        title: "Malicious Project",
        jurisdiction: "US",
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("blocks cross-tenant read: User B cannot get or view User A's project", async () => {
    const orgIdA = projectsService.getPrimaryOrgIdForUser(userStudioA_Owner);
    const project = await projectsService.createProject(userStudioA_Owner, {
      organizationId: orgIdA,
      title: "Confidential Script A",
      jurisdiction: "US",
    });

    // User A can read
    const fetched = await projectsService.getProject(
      userStudioA_Owner,
      project.id,
    );
    expect(fetched.id).toBe(project.id);

    // User B is forbidden
    await expect(
      projectsService.getProject(userStudioB_Owner, project.id),
    ).rejects.toThrow(ForbiddenException);
  });

  it("omits cross-tenant projects from list query", async () => {
    const orgIdB = projectsService.getPrimaryOrgIdForUser(userStudioB_Owner);
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

  it("blocks non-owner deletion: PRODUCER cannot delete a project", async () => {
    const orgIdA = projectsService.getPrimaryOrgIdForUser(userStudioA_Owner);
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

    // Non-tenant cannot delete project
    await expect(
      projectsService.deleteProject(userStudioB_Owner, project.id),
    ).rejects.toThrow(ForbiddenException);
  });

  it("allows OWNER deletion and appends an auditable, content-free log entry", async () => {
    const orgIdA = projectsService.getPrimaryOrgIdForUser(userStudioA_Owner);
    const project = await projectsService.createProject(userStudioA_Owner, {
      organizationId: orgIdA,
      title: "Project to Retire",
      jurisdiction: "US",
    });

    await projectsService.deleteProject(userStudioA_Owner, project.id);

    // Project is now soft-deleted, subsequent reads are blocked
    await expect(
      projectsService.getProject(userStudioA_Owner, project.id),
    ).rejects.toThrow(ForbiddenException);

    // Verify audit logs exist and are content-free
    const auditLogs = await projectsService.getAuditLogs(
      userStudioA_Owner,
      project.id,
    );
    expect(auditLogs.length).toBeGreaterThanOrEqual(2); // CREATED + DELETED

    const deleteAudit = auditLogs.find((l) => l.action === "PROJECT_DELETED");
    expect(deleteAudit).toBeDefined();
    expect(deleteAudit?.actorId).toBe(userStudioA_Owner.uid);

    // Content-free logging check: no title text in audit metadata
    const metadataStr = JSON.stringify(deleteAudit?.metadata);
    expect(metadataStr).not.toContain("Project to Retire");
  });
});
