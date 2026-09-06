import { z } from "zod";
import {
  AuditLogEntry,
  CanonicalEntity,
  IsoDateTime,
  Scene,
  ScriptVersion,
} from "@permissa/contracts";

export const ExecutionLease = z.object({
  activeRunId: z.string().nullable(),
  leaseOwner: z.string().nullable(),
  leaseExpiresAt: IsoDateTime.nullable(),
  leaseVersion: z.number().int().nonnegative(),
});

export type ExecutionLease = z.infer<typeof ExecutionLease>;

/**
 * Worker Firestore storage interface.
 * Implements Zod validation on all reads and writes.
 */
export class WorkerFirestoreClient {
  private readonly entities = new Map<string, Record<string, unknown>>();
  private readonly scenes = new Map<string, Record<string, unknown>>();
  private readonly scripts = new Map<string, Record<string, unknown>>();
  private readonly leases = new Map<string, Record<string, unknown>>();
  private readonly auditLogs: Record<string, unknown>[] = [];

  async getEntity(entityId: string): Promise<CanonicalEntity | null> {
    const raw = this.entities.get(entityId);
    if (!raw) return null;
    return CanonicalEntity.parse(raw);
  }

  async saveEntity(entity: CanonicalEntity): Promise<void> {
    const validated = CanonicalEntity.parse(entity);
    this.entities.set(
      validated.id,
      validated as unknown as Record<string, unknown>,
    );
  }

  async listEntitiesForScript(
    scriptVersionId: string,
  ): Promise<CanonicalEntity[]> {
    const results: CanonicalEntity[] = [];
    for (const raw of this.entities.values()) {
      const parsed = CanonicalEntity.parse(raw);
      if (parsed.scriptVersionId === scriptVersionId) {
        results.push(parsed);
      }
    }
    return results;
  }

  async saveScene(scene: Scene): Promise<void> {
    const validated = Scene.parse(scene);
    this.scenes.set(
      validated.id,
      validated as unknown as Record<string, unknown>,
    );
  }

  async getScene(sceneId: string): Promise<Scene | null> {
    const raw = this.scenes.get(sceneId);
    if (!raw) return null;
    return Scene.parse(raw);
  }

  async listScenesForScript(scriptVersionId: string): Promise<Scene[]> {
    const results: Scene[] = [];
    for (const raw of this.scenes.values()) {
      const parsed = Scene.parse(raw);
      if (parsed.scriptVersionId === scriptVersionId) {
        results.push(parsed);
      }
    }
    return results.sort((a, b) => a.ordinal - b.ordinal);
  }

  async getScriptVersion(scriptId: string): Promise<ScriptVersion | null> {
    const raw = this.scripts.get(scriptId);
    if (!raw) return null;
    return ScriptVersion.parse(raw);
  }

  async saveScriptVersion(script: ScriptVersion): Promise<void> {
    const validated = ScriptVersion.parse(script);
    this.scripts.set(
      validated.id,
      validated as unknown as Record<string, unknown>,
    );
  }

  async acquireLease(
    owner: string,
    runId: string,
    ttlSeconds = 300,
  ): Promise<ExecutionLease> {
    const raw = this.leases.get("global_lease");
    const current = raw ? (ExecutionLease.parse(raw) as ExecutionLease) : null;
    const now = new Date();

    if (current && current.activeRunId && current.leaseExpiresAt) {
      const expires = new Date(current.leaseExpiresAt);
      if (expires > now && current.activeRunId !== runId) {
        throw new Error("LEASE_HELD_BY_ANOTHER_RUN");
      }
    }

    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
    const newLease: ExecutionLease = {
      activeRunId: runId,
      leaseOwner: owner,
      leaseExpiresAt: expiresAt,
      leaseVersion: (current?.leaseVersion ?? 0) + 1,
    };

    this.leases.set(
      "global_lease",
      newLease as unknown as Record<string, unknown>,
    );
    return newLease;
  }

  async releaseLease(runId: string): Promise<void> {
    const raw = this.leases.get("global_lease");
    if (!raw) return;
    const current = ExecutionLease.parse(raw) as ExecutionLease;
    if (current.activeRunId === runId) {
      const released: ExecutionLease = {
        activeRunId: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        leaseVersion: current.leaseVersion + 1,
      };
      this.leases.set(
        "global_lease",
        released as unknown as Record<string, unknown>,
      );
    }
  }

  async appendAuditLog(log: AuditLogEntry): Promise<void> {
    const validated = AuditLogEntry.parse(log);
    this.auditLogs.push(validated as unknown as Record<string, unknown>);
  }
}
