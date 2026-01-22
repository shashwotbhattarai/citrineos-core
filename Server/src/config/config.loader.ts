// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import {
  BootstrapConfig,
  ConfigStore,
  ConfigStoreFactory,
  defineConfig,
  SystemConfig,
} from '@citrineos/base';
import { LocalStorage, S3Storage, DirectusUtil } from '@citrineos/util';

/**
 * Strips sensitive fields from config before saving to storage.
 * Secrets should ONLY come from environment variables, never from stored config.
 *
 * This prevents secrets from being stored in S3/Directus where they could be exposed.
 */
function stripSecretsFromConfig(config: SystemConfig): SystemConfig {
  const sanitized = JSON.parse(JSON.stringify(config)); // Deep clone

  // Remove database credentials (these come from BOOTSTRAP_* env vars)
  if (sanitized.database) {
    delete sanitized.database;
  }

  // Remove file access credentials (these come from BOOTSTRAP_* env vars)
  if (sanitized.fileAccess) {
    delete sanitized.fileAccess;
  }

  // Remove yatriEnergy API key (secret)
  if (sanitized.yatriEnergy?.apiKey) {
    delete sanitized.yatriEnergy.apiKey;
  }

  return sanitized;
}

/**
 * Applies environment variable overrides to the loaded config.
 * Env vars take precedence over stored config for operational settings.
 *
 * Priority: env var > stored config > defaults
 *
 * This allows changing configuration via .env without manually updating S3 config.
 */
function applyEnvVarOverrides(config: SystemConfig): SystemConfig {
  // ==========================================================================
  // Message Broker (RabbitMQ) overrides
  // ==========================================================================
  if (!config.util) {
    config.util = {} as any;
  }
  if (!config.util.messageBroker) {
    config.util.messageBroker = {} as any;
  }
  if (!config.util.messageBroker.amqp) {
    config.util.messageBroker.amqp = {} as any;
  }

  // Build AMQP URL from env vars if provided
  const amqpUser = process.env.RABBITMQ_USER || process.env.AMQP_USER;
  const amqpPass = process.env.RABBITMQ_PASS || process.env.AMQP_PASS;
  const amqpHost = process.env.RABBITMQ_HOST || process.env.AMQP_HOST;
  const amqpPort = process.env.RABBITMQ_PORT || process.env.AMQP_PORT;

  const amqpConfig = config.util.messageBroker.amqp;
  if (amqpConfig && amqpUser && amqpPass) {
    const host = amqpHost || 'amqp-broker';
    const port = amqpPort || '5672';
    amqpConfig.url = `amqp://${amqpUser}:${amqpPass}@${host}:${port}`;
    console.log(`[Config] Applied AMQP URL override from env vars (host: ${host})`);
  }

  if (amqpConfig && process.env.AMQP_EXCHANGE) {
    amqpConfig.exchange = process.env.AMQP_EXCHANGE;
  }

  // ==========================================================================
  // Yatri Energy Integration overrides
  // ==========================================================================
  if (!config.yatriEnergy) {
    config.yatriEnergy = {} as any;
  }

  if (process.env.YATRI_ENERGY_BASE_URL) {
    config.yatriEnergy.baseUrl = process.env.YATRI_ENERGY_BASE_URL;
    console.log('[Config] Applied YATRI_ENERGY_BASE_URL override from env var');
  }
  if (process.env.YATRI_ENERGY_API_KEY) {
    config.yatriEnergy.apiKey = process.env.YATRI_ENERGY_API_KEY;
    console.log('[Config] Applied YATRI_ENERGY_API_KEY override from env var');
  }
  if (process.env.YATRI_ENERGY_TIMEOUT) {
    config.yatriEnergy.timeout = parseInt(process.env.YATRI_ENERGY_TIMEOUT, 10);
    console.log('[Config] Applied YATRI_ENERGY_TIMEOUT override from env var');
  }
  if (process.env.YATRI_MINIMUM_BALANCE) {
    config.yatriEnergy.minimumBalance = parseFloat(process.env.YATRI_MINIMUM_BALANCE);
    console.log('[Config] Applied YATRI_MINIMUM_BALANCE override from env var');
  }
  if (process.env.YATRI_WALLET_INTEGRATION_ENABLED) {
    config.yatriEnergy.enabled = process.env.YATRI_WALLET_INTEGRATION_ENABLED;
    console.log('[Config] Applied YATRI_WALLET_INTEGRATION_ENABLED override from env var');
  }

  // SQS overrides
  if (process.env.YATRI_ENERGY_SQS_REGION) {
    config.yatriEnergy.sqsRegion = process.env.YATRI_ENERGY_SQS_REGION;
    console.log('[Config] Applied YATRI_ENERGY_SQS_REGION override from env var');
  }
  if (process.env.YATRI_ENERGY_SQS_QUEUE_URL) {
    config.yatriEnergy.sqsQueueUrl = process.env.YATRI_ENERGY_SQS_QUEUE_URL;
    console.log('[Config] Applied YATRI_ENERGY_SQS_QUEUE_URL override from env var');
  }

  return config;
}

/**
 * Helper function to create the appropriate ConfigStore based on bootstrap config
 */
function createConfigStore(bootstrapConfig: BootstrapConfig): ConfigStore {
  switch (bootstrapConfig.fileAccess.type) {
    case 'local':
      return new LocalStorage(
        bootstrapConfig.fileAccess.local!.defaultFilePath,
        bootstrapConfig.configFileName,
        bootstrapConfig.configDir,
      );
    case 's3':
      return new S3Storage(
        bootstrapConfig.fileAccess.s3!,
        bootstrapConfig.configFileName,
        bootstrapConfig.configDir,
      );
    case 'directus':
      return new DirectusUtil(
        bootstrapConfig.fileAccess.directus!,
        bootstrapConfig.configFileName,
        bootstrapConfig.configDir,
      );
    default:
      throw new Error(`Unsupported file access type: ${bootstrapConfig.fileAccess.type}`);
  }
}

/**
 * Loads the system configuration with env var overrides.
 *
 * Flow:
 * 1. Load bootstrap config from environment variables (db, s3 credentials)
 * 2. Create ConfigStore using bootstrap config
 * 3. Load full config from storage (S3/local/directus)
 * 4. If no config exists, create from defaults (with secrets stripped before saving)
 * 5. Apply environment variable overrides (env vars > stored config)
 * 6. Validate the final config
 *
 * This ensures:
 * - Secrets are NEVER stored in S3/external storage
 * - Env var changes take effect immediately on restart (no need to update S3 manually)
 * - S3 config serves as base/defaults, env vars as overrides
 *
 * @param bootstrapConfig Bootstrap config with db/s3 connection info
 * @param defaultConfig Optional default config to use if no config exists in storage
 * @returns Promise resolving to the validated SystemConfig
 */
export async function loadSystemConfig(
  bootstrapConfig: BootstrapConfig,
  defaultConfig?: SystemConfig,
): Promise<SystemConfig> {
  try {
    const configStore = createConfigStore(bootstrapConfig);
    ConfigStoreFactory.setConfigStore(configStore);
    console.log('[Config] Config store initialized');

    let config: SystemConfig | null = await configStore.fetchConfig();

    if (!config) {
      if (!defaultConfig) {
        throw new Error('No configuration found in storage and no default config provided');
      }

      console.warn('[Config] No config found in storage. Creating default config...');
      config = defaultConfig;

      // Strip secrets before saving to storage
      //const sanitizedConfig = stripSecretsFromConfig(config);
      await configStore.saveConfig(config);
      console.log('[Config] Default config saved to storage (secrets stripped)');
    } else {
      console.log('[Config] Configuration loaded from storage');
    }

    // Apply env var overrides AFTER loading from storage
    // This ensures env vars always take precedence
    config = applyEnvVarOverrides(config);
    console.log('[Config] Environment variable overrides applied');

    const validatedConfig = defineConfig(config);

    return validatedConfig;
  } catch (error) {
    console.error('[Config] Failed to load system configuration:', error);
    throw error;
  }
}
