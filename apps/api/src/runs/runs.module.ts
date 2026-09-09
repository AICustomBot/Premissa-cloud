import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { ResearchModule } from "../research/research.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { RunsController } from "./runs.controller.js";
import { RunsService } from "./runs.service.js";

@Module({
  imports: [AuthModule, StorageModule, ProjectsModule, ResearchModule],
  controllers: [RunsController],
  providers: [RunsService],
  exports: [RunsService],
})
export class RunsModule {}
