import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "./auth.guard.js";
import { CurrentUser } from "./current-user.decorator.js";
import type { AuthenticatedUser } from "./auth.types.js";
import { HandoffService, type HandoffResult } from "./handoff.service.js";

/**
 * Identity handoff between the two browser origins.
 *
 * Guarded like every other route: the caller must already hold a valid ID
 * token, which is what makes minting a second credential for the same subject
 * safe. It also means the email-verification gate in AuthService applies here
 * without being repeated, so an unverified password account cannot cross into
 * the dashboard.
 */
@Controller("auth")
@UseGuards(AuthGuard)
export class HandoffController {
  constructor(private readonly handoffService: HandoffService) {}

  /**
   * POST /v1/auth/handoff
   *
   * 200 rather than 201: nothing is created or stored server-side. The
   * response is a short-lived credential derived from the presented one.
   */
  @Post("handoff")
  @HttpCode(200)
  mintHandoff(@CurrentUser() user: AuthenticatedUser): Promise<HandoffResult> {
    return this.handoffService.mintHandoff(user);
  }
}
