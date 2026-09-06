import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller.js";
import { AuthModule } from "./auth/auth.module.js";
import { ProjectsModule } from "./projects/projects.module.js";

/**
 * Feature modules are added per tranche:
 * auth, organizations, projects, uploads, scripts, entities, runs, queue,
 * research, findings, evidence, reviews, reports, usage, admin, observability.
 */
@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [HealthController],
})
export class AppModule {}
