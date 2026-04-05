import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { getJwtSettings } from './jwt-settings';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: getJwtSettings().secret,
      signOptions: {
        issuer: getJwtSettings().issuer,
        audience: getJwtSettings().audience,
        expiresIn: `${getJwtSettings().expiryMinutes}m`,
      },
    }),
  ],
  providers: [JwtStrategy],
  exports: [JwtModule],
})
export class AuthModule {}
