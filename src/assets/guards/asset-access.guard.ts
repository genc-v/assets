import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

export type AssetAccessLevel = 'read' | 'write' | 'delete';

export const ASSET_ACCESS_KEY = 'assetAccess';

const ALLOWED_ROLES: Record<AssetAccessLevel, Set<string>> = {
  read: new Set(['Admin', 'Editor', 'Viewer']),
  write: new Set(['Admin', 'Editor']),
  delete: new Set(['Admin']),
};

@Injectable()
export class AssetAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const level =
      this.reflector.get<AssetAccessLevel>(
        ASSET_ACCESS_KEY,
        context.getHandler(),
      ) ?? 'read';

    const req = context.switchToHttp().getRequest<Request>();
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedException();
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

    if (!ALLOWED_ROLES[level].has(role)) {
      const required = [...ALLOWED_ROLES[level]].join(', ');
      throw new ForbiddenException(
        `Role '${role}' is not permitted for this action — ${required} required`,
      );
    }

    (req as Request & { orgRole: string }).orgRole = role;
    return true;
  }
}
