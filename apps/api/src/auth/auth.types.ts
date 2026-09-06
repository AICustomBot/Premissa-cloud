import { Role } from "@permissa/contracts";

export interface AuthenticatedUser {
  uid: string;
  email: string;
  name?: string;
  organizationId?: string;
  defaultRole: (typeof Role)["_type"];
}
