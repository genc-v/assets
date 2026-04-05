export type JwtSettings = {
  secret: string;
  issuer: string;
  audience: string;
  expiryMinutes: number;
};

export function getJwtSettings(): JwtSettings {
  const secret = process.env.JWT_SECRET;
  const issuer = process.env.JWT_ISSUER ?? 'cms';
  const audience = process.env.JWT_AUDIENCE ?? 'account';
  const expiryMinutes = Number(process.env.JWT_EXPIRY_MINUTES ?? 60);

  if (!secret) {
    throw new Error('JWT_SECRET is required');
  }

  return {
    secret,
    issuer,
    audience,
    expiryMinutes: Number.isFinite(expiryMinutes) ? expiryMinutes : 60,
  };
}
