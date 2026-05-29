import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

// Roles permitted to upload files to an organisation (Viewer is read-only)
const UPLOAD_ROLES = new Set(['Editor', 'Admin']);

@Injectable()
export class OrgAccessGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException();
    }
    const token = authHeader.slice(7);

    const orgId = req.params.orgId as string;
    const baseUrl =
      process.env.CMSORG_BASE_URL?.replace(/\/$/, '') ??
      'http://localhost:5059';

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/organisations/${orgId}/role`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      throw new ForbiddenException(
        'Organisation service is unreachable — cannot verify access',
      );
    }

    if (res.status === 401) throw new UnauthorizedException();
    if (res.status === 403)
      throw new ForbiddenException('You are not a member of this organisation');
    if (!res.ok)
      throw new ForbiddenException('Could not verify organisation membership');

    const body = (await res.json()) as { role?: string; Role?: string };
    const role = body.role ?? body.Role ?? '';

    if (!UPLOAD_ROLES.has(role)) {
      throw new ForbiddenException(
        `Role '${role}' cannot upload files — Editor or Admin required`,
      );
    }

    return true;
  }
}
