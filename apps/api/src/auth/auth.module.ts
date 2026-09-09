import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service.js";
import { AuthGuard } from "./auth.guard.js";
import { HandoffController } from "./handoff.controller.js";
import { HandoffService } from "./handoff.service.js";

@Module({
  controllers: [HandoffController],
  providers: [AuthService, AuthGuard, HandoffService],
  exports: [AuthService, AuthGuard, HandoffService],
})
export class AuthModule {}
