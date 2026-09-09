import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthService } from "./auth.service.js";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    try {
      const user = await this.authService.verifyToken(authHeader);
      request.user = user;
      return true;
    } catch (err: unknown) {
      // Preserve the reason the service chose. Flattening everything into
      // AUTH_REQUIRED made EMAIL_NOT_VERIFIED indistinguishable from an
      // expired token, so the console could not tell the operator what to do.
      // Anything else is still reduced to AUTH_REQUIRED: an unexpected error
      // must not leak internals through a 401 body.
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException("AUTH_REQUIRED");
    }
  }
}
