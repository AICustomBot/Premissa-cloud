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
    } catch {
      throw new UnauthorizedException("AUTH_REQUIRED");
    }
  }
}
