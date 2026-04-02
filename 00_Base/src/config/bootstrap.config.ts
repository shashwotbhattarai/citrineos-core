// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { BOOTSTRAP_CONFIG_ENV_VAR_PREFIX } from './defineConfig';

// Bootstrap schema contains what's needed to start the application
export const bootstrapConfigSchema = z.object({
  configFileName: z.string().default('config.json'),
  configDir: z.string().optional(),

  // Database configuration
  database: z.object({
    host: z.string().default('localhost'),
    port: z.number().int().positive().default(5432),
    database: z.string().default('citrine'),
    dialect: z.string().default('postgres'),
    username: z.string().default('citrine'),
    password: z.string().default('citrine'),
    ssl: z.boolean().default(false),
    pool: z
      .object({
        max: z.number().int().positive().optional(),
        min: z.number().int().nonnegative().optional(),
        acquire: z.number().int().positive().optional(),
        idle: z.number().int().nonnegative().optional(),
        evict: z.number().int().positive().optional(),
      })
      .optional(),
    sync: z.boolean().default(false),
    alter: z.boolean().default(false),
    force: z.boolean().default(false),
    maxRetries: z.number().int().positive().default(3),
    retryDelay: z.number().int().positive().default(1000),
  }),

  // File access configuration
  fileAccess: z
    .object({
      type: z.enum(['local', 's3', 'directus']),
      local: z
        .object({
          defaultFilePath: z.string().default('data'),
        })
        .optional(),
      s3: z
        .object({
          region: z.string().optional(),
          endpoint: z.string().optional(),
          defaultBucketName: z.string().default('citrineos-s3-bucket'),
          s3ForcePathStyle: z.boolean().default(true),
          accessKeyId: z.string().optional(),
          secretAccessKey: z.string().optional(),
        })
        .optional(),
      directus: z
        .object({
          host: z.string().default('localhost'),
          port: z.number().int().positive().default(8055),
          token: z.string().optional(),
          username: z.string().optional(),
          password: z.string().optional(),
          generateFlows: z.boolean().default(false),
        })
        .optional(),
    })
    .refine(
      (obj) => {
        // Ensure the selected type has corresponding config
        switch (obj.type) {
          case 'local':
            return !!obj.local;
          case 's3':
            return !!obj.s3;
          case 'directus':
            return !!obj.directus;
          default:
            return false;
        }
      },
      {
        message: 'Configuration for the selected file access type must be provided',
      },
    ),

  // AMQP (RabbitMQ) configuration — read from container env vars built by docker-compose
  amqp: z.object({
    url: z.string(),
    exchange: z.string().default(''),
  }),

  // API key secret (optional — only needed when apiKey auth is enabled in config.json)
  apiKey: z.string().optional(),

  // Yatri Energy midlayer integration
  yatriEnergy: z
    .object({
      enabled: z.boolean().default(false),
      baseUrl: z.string().optional(),
      apiKey: z.string().optional(),
      rabbitmqUrl: z.string().optional(),
      rabbitmqExchange: z.string().default('citrineos'),
      sqsRegion: z.string().optional(),
      sqsQueueUrl: z.string().optional(),
    })
    .default({}),

  // Hasura health check URL
  hasuraHealthUrl: z.string().optional(),

  // Deployment target (e.g. 'cloud' for JSON logging)
  deploymentTarget: z.string().optional(),
});

export type BootstrapConfig = z.infer<typeof bootstrapConfigSchema>;

/**
 * Helper function to load environment variables based on prefix
 */
function getEnvVarValue(key: string): string | undefined {
  const envKey = `${BOOTSTRAP_CONFIG_ENV_VAR_PREFIX}${key}`.toUpperCase();
  return process.env[envKey];
}

/**
 * Parse a potentially JSON-formatted environment variable
 */
function parseEnvValue(value: string): any {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Load bootstrap configuration from environment variables
 */
export function loadBootstrapConfig(): BootstrapConfig {
  const config: Record<string, any> = {
    configFileName: getEnvVarValue('config_filename') || 'config.json',
    configDir: getEnvVarValue('config_dir'),

    // Database configuration
    database: {
      host: getEnvVarValue('database_host'),
      port: getEnvVarValue('database_port') && parseInt(getEnvVarValue('database_port')!, 10),
      database: getEnvVarValue('database_name'),
      dialect: getEnvVarValue('database_dialect'),
      username: getEnvVarValue('database_username'),
      password: getEnvVarValue('database_password'),
      ssl: getEnvVarValue('database_ssl') && parseEnvValue(getEnvVarValue('database_ssl')!),
      sync: getEnvVarValue('database_sync') && parseEnvValue(getEnvVarValue('database_sync')!),
      alter: getEnvVarValue('database_alter') && parseEnvValue(getEnvVarValue('database_alter')!),
      force: getEnvVarValue('database_force') && parseEnvValue(getEnvVarValue('database_force')!),
      maxRetries:
        getEnvVarValue('database_max_retries') &&
        parseInt(getEnvVarValue('database_max_retries')!, 10),
      retryDelay:
        getEnvVarValue('database_retry_delay') &&
        parseInt(getEnvVarValue('database_retry_delay')!, 10),
    },

    fileAccess: {
      type: getEnvVarValue('file_access_type') || 'local',
    },
  };
  const pool: Record<string, number | undefined> = {
    max: getEnvVarValue('database_pool_max')
      ? parseInt(getEnvVarValue('database_pool_max')!, 10)
      : undefined,
    min: getEnvVarValue('database_pool_min')
      ? parseInt(getEnvVarValue('database_pool_min')!, 10)
      : undefined,
    acquire: getEnvVarValue('database_pool_acquire')
      ? parseInt(getEnvVarValue('database_pool_acquire')!, 10)
      : undefined,
    idle: getEnvVarValue('database_pool_idle')
      ? parseInt(getEnvVarValue('database_pool_idle')!, 10)
      : undefined,
    evict: getEnvVarValue('database_pool_evict')
      ? parseInt(getEnvVarValue('database_pool_evict')!, 10)
      : undefined,
  };
  const definedPool = Object.fromEntries(Object.entries(pool).filter(([, v]) => v !== undefined));
  if (Object.keys(definedPool).length > 0) {
    config.database.pool = definedPool as any;
  }

  // File access configuration
  switch (config.fileAccess.type) {
    case 'local':
      config.fileAccess.local = {
        defaultFilePath: getEnvVarValue('file_access_local_default_file_path'),
      };
      break;
    case 's3':
      config.fileAccess.s3 = {
        region: getEnvVarValue('file_access_s3_region'),
        endpoint: getEnvVarValue('file_access_s3_endpoint'),
        defaultBucketName: getEnvVarValue('file_access_s3_default_bucket_name'),
        s3ForcePathStyle:
          getEnvVarValue('file_access_s3_force_path_style') &&
          parseEnvValue(getEnvVarValue('file_access_s3_force_path_style')!),
        accessKeyId: getEnvVarValue('file_access_s3_access_key_id'),
        secretAccessKey: getEnvVarValue('file_access_s3_secret_access_key'),
      };
      break;
    case 'directus':
      config.fileAccess.directus = {
        host: getEnvVarValue('file_access_directus_host'),
        port:
          getEnvVarValue('file_access_directus_port') &&
          parseInt(getEnvVarValue('file_access_directus_port')!, 10),
        token: getEnvVarValue('file_access_directus_token'),
        username: getEnvVarValue('file_access_directus_username'),
        password: getEnvVarValue('file_access_directus_password'),
      };
      break;
  }

  // AMQP configuration — these are the final container env vars (built by docker-compose from BOOTSTRAP_* parts)
  config.amqp = {
    url: process.env.AMQP_URL,
    exchange: process.env.AMQP_EXCHANGE || '',
  };

  // API key secret
  config.apiKey = process.env.CITRINEOS_API_KEY;

  // Yatri Energy midlayer integration
  config.yatriEnergy = {
    enabled: process.env.YATRI_WALLET_INTEGRATION_ENABLED === 'true',
    baseUrl: process.env.YATRI_ENERGY_BASE_URL,
    apiKey: process.env.YATRI_ENERGY_API_KEY,
    rabbitmqUrl: process.env.YATRI_ENERGY_RABBITMQ_URL,
    rabbitmqExchange: process.env.YATRI_ENERGY_RABBITMQ_EXCHANGE || 'citrineos',
    sqsRegion: process.env.YATRI_ENERGY_SQS_REGION,
    sqsQueueUrl: process.env.YATRI_ENERGY_SQS_QUEUE_URL,
  };

  // Hasura health check URL
  config.hasuraHealthUrl = process.env.HASURA_HEALTH_URL;

  // Deployment target
  config.deploymentTarget = process.env.DEPLOYMENT_TARGET;

  try {
    return bootstrapConfigSchema.parse(config);
  } catch (error) {
    console.error('Bootstrap configuration validation failed:', error);
    throw error;
  }
}
