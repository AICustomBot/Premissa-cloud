import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { FirebaseAuthGuard } from "../auth/firebase-auth.guard.js";
import { type AuthenticatedUser } from "../auth/auth.types.js";
import { ReviewsService } from "./reviews.service.js";
import { SubmitReviewRequest } from "@permissa/contracts";

@Controller("projects/:projectId")
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post("invitations")
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createInvitation(
    @Req() req: { user: AuthenticatedUser },
    @Param("projectId") projectId: string,
    @Body() body: { reviewerEmail: string },
  ) {
    return this.reviewsService.createInvitation(req.user, projectId, body);
  }

  @Post("invitations/:invitationId/accept")
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async acceptInvitation(
    @Req() req: { user: AuthenticatedUser },
    @Param("projectId") projectId: string,
    @Param("invitationId") invitationId: string,
  ) {
    return this.reviewsService.acceptInvitation(
      req.user,
      projectId,
      invitationId,
    );
  }

  @Get("invitations")
  @UseGuards(FirebaseAuthGuard)
  async listInvitations(
    @Req() req: { user: AuthenticatedUser },
    @Param("projectId") projectId: string,
  ) {
    const invitations = await this.reviewsService.listInvitations(
      req.user,
      projectId,
    );
    return {
      projectId,
      total: invitations.length,
      invitations,
    };
  }

  @Post("reviews/runs/:runId/request")
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async requestReview(
    @Req() req: { user: AuthenticatedUser },
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
  ) {
    return this.reviewsService.requestReview(req.user, projectId, runId);
  }

  @Post("reviews/runs/:runId/submit")
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async submitReview(
    @Req() req: { user: AuthenticatedUser },
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
    @Body() body: { changes: any[] },
  ) {
    return this.reviewsService.submitReview(req.user, projectId, {
      runId,
      changes: body.changes,
    });
  }

  @Post("reviews/runs/:runId/request-changes")
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async requestChanges(
    @Req() req: { user: AuthenticatedUser },
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
    @Body() body: { reason: string },
  ) {
    return this.reviewsService.requestChanges(
      req.user,
      projectId,
      runId,
      body.reason ?? "Screenplay changes required before clearance signoff.",
    );
  }

  @Post("reviews/runs/:runId/approve")
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async approveClearanceRun(
    @Req() req: { user: AuthenticatedUser },
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
    @Body() body: { reason?: string },
  ) {
    return this.reviewsService.approveClearanceRun(
      req.user,
      projectId,
      runId,
      body.reason ?? "All legal clearance items adjudicated and approved.",
    );
  }

  @Get("reports")
  @UseGuards(FirebaseAuthGuard)
  async listReports(
    @Req() req: { user: AuthenticatedUser },
    @Param("projectId") projectId: string,
  ) {
    const reports = await this.reviewsService.listReports(req.user, projectId);
    const fullReports = await this.reviewsService.listFullReports(
      req.user,
      projectId,
    );
    return {
      projectId,
      total: reports.length,
      reports,
      fullReports,
    };
  }

  @Post("reports/generate/:runId")
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async generateClearanceReport(
    @Req() req: { user: AuthenticatedUser },
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
  ) {
    return this.reviewsService.generateClearanceReport(
      req.user,
      projectId,
      runId,
    );
  }

  @Get("reports/:reportId")
  @UseGuards(FirebaseAuthGuard)
  async getClearanceReport(
    @Req() req: { user: AuthenticatedUser },
    @Param("projectId") projectId: string,
    @Param("reportId") reportId: string,
  ) {
    return this.reviewsService.getClearanceReport(
      req.user,
      projectId,
      reportId,
    );
  }

  @Get("reports/:reportId/certificate")
  @UseGuards(FirebaseAuthGuard)
  @Header("Content-Type", "text/html; charset=utf-8")
  async getClearanceCertificate(
    @Req() req: { user: AuthenticatedUser },
    @Param("projectId") projectId: string,
    @Param("reportId") reportId: string,
  ) {
    return this.reviewsService.getClearanceCertificateHtml(
      req.user,
      projectId,
      reportId,
    );
  }
}
