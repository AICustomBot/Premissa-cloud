import "./runtime-compat.js";
import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller.js";
import { AuthModule } from "./auth/auth.module.js";
import { StorageModule } from "./storage/storage.module.js";
import { ProjectsModule } from "./projects/projects.module.js";
import { ResearchModule } from "./research/research.module.js";
import { ReviewsModule } from "./reviews/reviews.module.js";
import { DifferentialModule } from "./differential/differential.module.js";

/**
 * Feature modules are added per tranche:
 * auth, organizations, projects, uploads, scripts, entities, runs, queue,
 * research, findings, evidence, reviews, reports, usage, differential, admin, observability.
 */
@Module({
  imports: [
    StorageModule,
    AuthModule,
    ProjectsModule,
    ResearchModule,
    ReviewsModule,
    DifferentialModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
