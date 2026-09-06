import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { ResearchModule } from "../research/research.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { DifferentialController } from "./differential.controller.js";
import { DifferentialService } from "./differential.service.js";

@Module({
  imports: [AuthModule, StorageModule, ProjectsModule, ResearchModule],
  controllers: [DifferentialController],
  providers: [DifferentialService],
  exports: [DifferentialService],
})
export class DifferentialModule {}
