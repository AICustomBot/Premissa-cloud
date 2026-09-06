import { describe, expect, it } from "vitest";
import {
  AuditLogEntry,
  CreateOrganizationRequest,
  CreateProjectRequest,
  generateUuidV7,
  Organization,
  Project,
  ProjectGrant,
  Uuid,
} from "../src/index";

describe("UUIDv7 generation & contracts validation", () => {
  it("generates a valid UUIDv7 that satisfies the Uuid schema", () => {
    const id = generateUuidV7();
    expect(Uuid.safeParse(id).success).toBe(true);
    expect(id[14]).toBe("7");
  });

  it("validates Project schema correctly", () => {
    const orgId = generateUuidV7();
    const projectId = generateUuidV7();
    const validProject = {
      id: projectId,
      organizationId: orgId,
      title: "Neon Horizon",
      jurisdiction: "US",
      createdBy: "user-123",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };

    const parsed = Project.safeParse(validProject);
    expect(parsed.success).toBe(true);
  });

  it("validates ProjectGrant and AuditLogEntry", () => {
    const orgId = generateUuidV7();
    const projectId = generateUuidV7();
    const auditId = generateUuidV7();

    const grant = {
      projectId,
      userId: "user-producer",
      role: "PRODUCER",
      grantedAt: new Date().toISOString(),
    };
    expect(ProjectGrant.safeParse(grant).success).toBe(true);

    const audit = {
      id: auditId,
      organizationId: orgId,
      projectId,
      actorId: "user-producer",
      action: "PROJECT_CREATED",
      timestamp: new Date().toISOString(),
      metadata: { count: 1 },
    };
    expect(AuditLogEntry.safeParse(audit).success).toBe(true);
  });

  it("validates CreateProjectRequest and Organization", () => {
    const orgId = generateUuidV7();
    const org = {
      id: orgId,
      name: "Paramount Pictures Inc",
      ownerId: "user-admin",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(Organization.safeParse(org).success).toBe(true);

    const req = {
      organizationId: orgId,
      title: "Silver Lining",
      jurisdiction: "US",
    };
    expect(CreateProjectRequest.safeParse(req).success).toBe(true);
    expect(
      CreateOrganizationRequest.safeParse({ name: "Studio A" }).success,
    ).toBe(true);
  });
});
