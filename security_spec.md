# Security Specification & Threat Model: PERMISSA Clearance Platform

## Phase 0: Payload-First Security TDD

### 1. Data Invariants

1. **Identity & Tenant Isolation**: A user can only read and write user profile data where `userId == request.auth.uid`.
2. **Organization Integrity**: Organizations can only be created by signed-in users setting themselves as `ownerId`. Updates must preserve `ownerId` and `createdAt`.
3. **Project Access & Membership**: A project can only be created or modified by members of the owning organization. A project's `organizationId` and `createdBy` fields are immutable.
4. **Sub-Resource Relational Gate**: An entity cannot exist or be modified outside a valid parent project. The project must exist and be accessible to the caller.
5. **Role-Based Update Partitioning**:
   - `PRODUCER` can confirm entities (`confirmedByProducer`).
   - `REVIEWER` can only modify `initialProposedStatus` and `reviewerNotes` (remedies/legal commentary).
   - Once a clearance run is approved (`isRunApproved == true`), project state is sealed against non-admin modification.
6. **Zero Content Leakage in Telemetry**: Audit logs are append-only. No screenplay text or private evidence excerpt may be written to audit logs.
7. **Temporal & Type Integrity**: `updatedAt` must always match `request.time`. String lengths and ID patterns must strictly match defined maximum limits to prevent Denial-of-Wallet attacks.

---

### 2. The "Dirty Dozen" Threat Payloads

1. **Payload 1: Identity Spoofing (Foreign Profile Hijack)**
   Attempting to overwrite another user's profile document with a forged UID.
   ```json
   { "id": "victim-uid-999", "name": "Attacker", "email": "evil@domain.com", "role": "OWNER", "organizationId": "org-1", "createdAt": "2026-09-01T00:00:00Z" }
   ```
   *Expected*: PERMISSION_DENIED.

2. **Payload 2: Role Self-Escalation**
   A standard researcher attempting to grant themselves `OWNER` or `ADMIN` role in an unauthorized profile write.
   ```json
   { "role": "OWNER" }
   ```
   *Expected*: PERMISSION_DENIED.

3. **Payload 3: Ghost Field Injection (Shadow Update)**
   Attempting an entity update with an undocumented `isSystemAdmin: true` field.
   ```json
   { "confirmedByProducer": true, "isSystemAdmin": true }
   ```
   *Expected*: PERMISSION_DENIED (violates `affectedKeys().hasOnly()`).

4. **Payload 4: ID Path Variable Poisoning**
   Attempting to write an entity with a 2KB junk character string as `entityId`.
   *Target Path*: `/projects/p1/entities/A_REALLY_LONG_STRING_OVER_128_CHARS...`
   *Expected*: PERMISSION_DENIED (fails `isValidId()` regex and length gate).

5. **Payload 5: Orphaned Entity Creation (Invalid Foreign Key)**
   Attempting to create a clearance entity referencing a non-existent `projectId`.
   ```json
   { "id": "ent-1", "projectId": "non-existent-proj", "canonicalName": "Ghost Entity", "type": "PERSON_CHARACTER", "initialProposedStatus": "RESEARCH_CLEARED", "rationale": "Test", "confirmedByProducer": false, "updatedAt": "2026-09-01T00:00:00Z" }
   ```
   *Expected*: PERMISSION_DENIED (`exists()` gate fails).

6. **Payload 6: Producer Role Bypass on Review Notes**
   A Producer user attempting to overwrite legal reviewer commentary or force status without review qualification.
   ```json
   { "reviewerNotes": "Cleared by producer bypassing legal" }
   ```
   *Expected*: PERMISSION_DENIED.

7. **Payload 7: Reviewer Bypassing Producer Confirmation Gate**
   A Reviewer attempting to toggle `confirmedByProducer` without producer permissions.
   ```json
   { "confirmedByProducer": true }
   ```
   *Expected*: PERMISSION_DENIED.

8. **Payload 8: Terminal State Mutation on Sealed Run**
   Attempting to alter entity clearance status after project `isRunApproved` is `true`.
   ```json
   { "initialProposedStatus": "RESEARCH_CLEARED" }
   ```
   *Expected*: PERMISSION_DENIED (terminal lock on approved project runs).

9. **Payload 9: Denial-of-Wallet String Inflation**
   Attempting to write a 1MB payload string into `canonicalName` or `rationale`.
   ```json
   { "canonicalName": "AAAAA... (100,000 characters)" }
   ```
   *Expected*: PERMISSION_DENIED (`.size() <= 200` gate fails).

10. **Payload 10: Client-Forged Timestamp Manipulation**
    Attempting to backdate or fake an `updatedAt` timestamp to bypass audit retention.
    ```json
    { "updatedAt": "1999-01-01T00:00:00Z" }
    ```
    *Expected*: PERMISSION_DENIED (`incoming().updatedAt == request.time`).

11. **Payload 11: Audit Log Tampering or Deletion**
    Attempting to update or delete existing tamper-evident audit trace entries.
    *Expected*: PERMISSION_DENIED (write/update/delete on auditLogs are strictly `if false`).

12. **Payload 12: Blanket Cross-Tenant Query Scraping**
    Unauthenticated or foreign tenant attempting to list all entities without tenant partition.
    *Expected*: PERMISSION_DENIED (query enforcer checks `resource.data` and parent project organization).
