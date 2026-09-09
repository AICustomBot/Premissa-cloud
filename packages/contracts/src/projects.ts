import { z } from "zod";
import { IsoDateTime } from "./common.js";
import { Jurisdiction, Role } from "./enums.js";
import { OrganizationId, ProjectId, Uuid } from "./ids.js";

export const Organization = z.object({
  id: OrganizationId,
  name: z.string().min(1).max(80),
  ownerId: z.string().min(1),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

export type Organization = z.infer<typeof Organization>;

export const CreateOrganizationRequest = z.object({
  name: z.string().min(1).max(80),
});

export type CreateOrganizationRequest = z.infer<
  typeof CreateOrganizationRequest
>;

export const Project = z.object({
  id: ProjectId,
  organizationId: OrganizationId,
  title: z.string().min(1).max(120),
  jurisdiction: Jurisdiction.default("US"),
  createdBy: z.string().min(1),
  version: z.number().int().nonnegative().default(1),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  deletedAt: IsoDateTime.nullable().default(null),
});

export type Project = z.infer<typeof Project>;

export const CreateProjectRequest = z.object({
  organizationId: OrganizationId,
  title: z.string().min(1).max(200),
  jurisdiction: Jurisdiction.default("US"),
  authorizedUseConfirmed: z.boolean().optional().default(true),
});

export type CreateProjectRequest = z.input<typeof CreateProjectRequest>;

export const ProjectGrant = z.object({
  projectId: ProjectId,
  userId: z.string().min(1),
  role: Role,
  grantedAt: IsoDateTime,
});

export type ProjectGrant = z.infer<typeof ProjectGrant>;

export const AuditLogEntry = z.object({
  id: Uuid,
  organizationId: OrganizationId,
  projectId: ProjectId.optional(),
  actorId: z.string().min(1),
  action: z.string().min(1),
  timestamp: IsoDateTime,
  metadata: z.record(z.string(), z.unknown()),
});

export type AuditLogEntry = z.infer<typeof AuditLogEntry>;
