import { Module } from "@nestjs/common";
import { ReviewsController } from "./reviews.controller.js";
import { ReviewsService } from "./reviews.service.js";
import { StorageModule } from "../storage/storage.module.js";
import { ProjectsModule } from "../projects/projects.module.js";

@Module({
  imports: [StorageModule, ProjectsModule],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
