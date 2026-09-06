import { Module } from "@nestjs/common";
import { ResearchController } from "./research.controller.js";
import { ResearchService } from "./research.service.js";
import { StatutoryRegistryAdapter } from "./adapters/statutory-registry.adapter.js";
import { IndustryDatabaseAdapter } from "./adapters/industry-database.adapter.js";
import { LiveSearchAdapter } from "./adapters/live-search.adapter.js";
import { CircuitBreaker } from "./circuit/circuit-breaker.js";
import { RateLimiter } from "./circuit/rate-limiter.js";
import { UsageLedgerService } from "./ledger/usage-ledger.service.js";
import { StorageModule } from "../storage/storage.module.js";
import { AuthModule } from "../auth/auth.module.js";

@Module({
  imports: [StorageModule, AuthModule],
  controllers: [ResearchController],
  providers: [
    ResearchService,
    StatutoryRegistryAdapter,
    IndustryDatabaseAdapter,
    LiveSearchAdapter,
    CircuitBreaker,
    RateLimiter,
    UsageLedgerService,
  ],
  exports: [
    ResearchService,
    UsageLedgerService,
    CircuitBreaker,
    RateLimiter,
    StatutoryRegistryAdapter,
    IndustryDatabaseAdapter,
    LiveSearchAdapter,
  ],
})
export class ResearchModule {}
