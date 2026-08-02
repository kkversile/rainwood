import { plainToInstance } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';

class Environment {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV = 'development';

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 4000;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  JWT_ACCESS_SECRET!: string;

  @IsString()
  JWT_REFRESH_SECRET!: string;

  @IsOptional()
  @IsString()
  PAYMENT_PROVIDER?: string;

  @IsOptional()
  @IsString()
  AXISROOMS_MODE?: string;
}

export function validateEnvironment(config: Record<string, unknown>) {
  const values = plainToInstance(Environment, {
    ...config,
    PORT: Number(config.PORT ?? config.API_PORT ?? 4000),
  });
  const errors = validateSync(values, { skipMissingProperties: false });
  if (errors.length) {
    throw new Error(`Invalid environment configuration: ${errors.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('; ')}`);
  }
  if (values.NODE_ENV === 'production' && values.JWT_ACCESS_SECRET.length < 32) {
    throw new Error('JWT_ACCESS_SECRET must contain at least 32 characters in production');
  }
  if (values.NODE_ENV === 'production' && values.JWT_REFRESH_SECRET.length < 32) {
    throw new Error('JWT_REFRESH_SECRET must contain at least 32 characters in production');
  }
  return config;
}
