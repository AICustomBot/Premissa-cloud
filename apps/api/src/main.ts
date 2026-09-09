import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

/**
 * Resolve the CORS allowlist.
 *
 * The operator console is served from a different origin (an AI Studio
 * `run.app` host), so the API must opt that origin in explicitly. An empty
 * list in production denies every cross-origin request: failing closed is
 * preferable to a wildcard, because this API returns tenant-scoped clearance
 * data.
 */
const resolveAllowedOrigins = (logger: Logger): string[] => {
  const raw = (process.env.PERMISSA_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (raw.length > 0) {
    return raw;
  }

  if (process.env.NODE_ENV === "production") {
    logger.error(
      "PERMISSA_ALLOWED_ORIGINS is empty. All cross-origin browser requests will be refused.",
    );
    return [];
  }

  return ["http://localhost:3001", "http://localhost:3000"];
};

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = new Logger("Bootstrap");

  app.setGlobalPrefix("v1");

  app.enableCors({
    origin: resolveAllowedOrigins(logger),
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    // Authorisation is a bearer token, never a cookie. Allowing credentials
    // would widen the CSRF surface without enabling anything we use.
    credentials: false,
    maxAge: 3600,
  });

  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 8080), "0.0.0.0");
};

void bootstrap();
