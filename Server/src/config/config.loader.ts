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

// =============================================================================
// COMMENTED OUT: stripSecretsFromConfig
// No longer needed — server never writes config back to storage.
// Bootstrap fields (secrets, infrastructure) are NOT in config.json at all.
// They are read directly from process.env by consumer code.
// =============================================================================
// function stripSecretsFromConfig(config: SystemConfig): SystemConfig {
//   const sanitized = JSON.parse(JSON.stringify(config)); // Deep clone
//   if (sanitized.database) { delete sanitized.database; }
//   if (sanitized.fileAccess) { delete sanitized.fileAccess; }
//   if (sanitized.yatriEnergy?.apiKey) { delete sanitized.yatriEnergy.apiKey; }
//   return sanitized;
// }

// =============================================================================
// COMMENTED OUT: applyEnvVarOverrides
// No longer needed — bootstrap values are read directly from process.env
// by consumer code (sender.ts, receiver.ts, MessageApi.ts, module.ts, index.ts).
// This eliminates the contradiction where config.json shows one value but the
// server silently overrides it with .env values.
// =============================================================================
// function applyEnvVarOverrides(config: SystemConfig): SystemConfig {
//   // Message Broker (RabbitMQ) overrides
//   if (!config.util) { config.util = {} as any; }
//   if (!config.util.messageBroker) { config.util.messageBroker = {} as any; }
//   if (!config.util.messageBroker.amqp) { config.util.messageBroker.amqp = {} as any; }
//   const amqpUser = process.env.RABBITMQ_USER || process.env.AMQP_USER;
//   const amqpPass = process.env.RABBITMQ_PASS || process.env.AMQP_PASS;
//   const amqpHost = process.env.RABBITMQ_HOST || process.env.AMQP_HOST;
//   const amqpPort = process.env.RABBITMQ_PORT || process.env.AMQP_PORT;
//   const amqpConfig = config.util.messageBroker.amqp;
//   if (amqpConfig && amqpUser && amqpPass) {
//     const host = amqpHost || 'amqp-broker';
//     const port = amqpPort || '5672';
//     amqpConfig.url = `amqp://${amqpUser}:${amqpPass}@${host}:${port}`;
//   }
//   if (amqpConfig && process.env.AMQP_EXCHANGE) {
//     amqpConfig.exchange = process.env.AMQP_EXCHANGE;
//   }
//   // Yatri Energy Integration overrides
//   if (!config.yatriEnergy) { config.yatriEnergy = {} as any; }
//   if (process.env.YATRI_ENERGY_BASE_URL) { config.yatriEnergy.baseUrl = process.env.YATRI_ENERGY_BASE_URL; }
//   if (process.env.YATRI_ENERGY_API_KEY) { config.yatriEnergy.apiKey = process.env.YATRI_ENERGY_API_KEY; }
//   if (process.env.YATRI_ENERGY_TIMEOUT) { config.yatriEnergy.timeout = parseInt(process.env.YATRI_ENERGY_TIMEOUT, 10); }
//   if (process.env.YATRI_MINIMUM_BALANCE) { config.yatriEnergy.minimumBalance = parseFloat(process.env.YATRI_MINIMUM_BALANCE); }
//   if (process.env.YATRI_WALLET_INTEGRATION_ENABLED) { config.yatriEnergy.enabled = process.env.YATRI_WALLET_INTEGRATION_ENABLED; }
//   if (process.env.YATRI_ENERGY_SQS_REGION) { config.yatriEnergy.sqsRegion = process.env.YATRI_ENERGY_SQS_REGION; }
//   if (process.env.YATRI_ENERGY_SQS_QUEUE_URL) { config.yatriEnergy.sqsQueueUrl = process.env.YATRI_ENERGY_SQS_QUEUE_URL; }
//   if (process.env.YATRI_ENERGY_RABBITMQ_URL) { config.yatriEnergy.rabbitmqUrl = process.env.YATRI_ENERGY_RABBITMQ_URL; }
//   if (process.env.YATRI_ENERGY_RABBITMQ_EXCHANGE) { config.yatriEnergy.rabbitmqExchange = process.env.YATRI_ENERGY_RABBITMQ_EXCHANGE; }
//   return config;
// }

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
 * Loads the system configuration from storage (S3/local/directus).
 *
 * IMPORTANT: Config separation principle:
 * - Bootstrap config (secrets, infrastructure, healthcheck deps) → process.env (from .env)
 * - System config (application behavior) → config.json in storage
 *
 * Bootstrap fields are NOT in config.json. Consumer code reads them directly
 * from process.env. This ensures config.json never contradicts actual values.
 *
 * If no config.json exists in storage, the server FAILS immediately.
 * There is no fallback/default config — you must upload config.json first.
 * See Server/src/config/config.json.example for the template.
 *
 * @param bootstrapConfig Bootstrap config with db/s3 connection info
 * @returns Promise resolving to the validated SystemConfig
 */
export async function loadSystemConfig(bootstrapConfig: BootstrapConfig): Promise<SystemConfig> {
  try {
    const configStore = createConfigStore(bootstrapConfig);
    ConfigStoreFactory.setConfigStore(configStore);
    console.log('[Config] Config store initialized');

    const config: SystemConfig | null = await configStore.fetchConfig();

    if (!config) {
      const storageType = bootstrapConfig.fileAccess.type;
      const configFile = bootstrapConfig.configFileName || 'config.json';
      const bucket =
        bootstrapConfig.configDir || bootstrapConfig.fileAccess.s3?.defaultBucketName || 'unknown';
      throw new Error(
        `No config.json found in storage (type: ${storageType}, bucket/dir: ${bucket}, key: ${configFile}).\n` +
          `You must upload a valid config.json before starting the server.\n` +
          `See Server/src/config/config.json.example for the template.`,
      );
    }

    console.log('[Config] Configuration loaded from storage');

    // COMMENTED OUT: applyEnvVarOverrides — bootstrap values are now read
    // directly from process.env by consumer code. No overrides needed.
    // config = applyEnvVarOverrides(config);

    const validatedConfig = defineConfig(config);

    return validatedConfig;
  } catch (error) {
    console.error('[Config] Failed to load system configuration:', error);
    throw error;
  }
}
