// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { BootstrapConfig, loadBootstrapConfig, SystemConfig } from '@citrineos/base';
import { loadSystemConfig } from './config.loader';

// =============================================================================
// COMMENTED OUT: Env-specific default config imports and getDefaultConfig()
// No longer needed — server requires config.json in storage (S3/local/directus).
// If config.json is missing, server fails immediately with a clear error.
// The env config files (docker.ts, local.ts, directus.docker.ts) are kept
// as reference but are no longer imported or used.
// =============================================================================
// import { createLocalConfig } from './envs/local';
// import { createDockerConfig } from './envs/docker';
// import { createDirectusConfig } from './envs/directus.docker';

// function getDefaultConfig(): SystemConfig {
//   switch (process.env.APP_ENV) {
//     case 'local':
//       return createLocalConfig();
//     case 'docker':
//       return createDockerConfig();
//     case 'directus':
//       return createDirectusConfig();
//     default:
//       throw new Error(`Invalid APP_ENV "${process.env.APP_ENV}"`);
//   }
// }

// Export a promise that resolves to the system configuration
export async function getSystemConfig(bootstrapConfig: BootstrapConfig): Promise<SystemConfig> {
  try {
    return await loadSystemConfig(bootstrapConfig);
  } catch (error) {
    console.error('Failed to initialize system configuration:', error);
    throw error;
  }
}

export const systemConfig: Promise<SystemConfig> = (async () => {
  const bootstrapConfig = loadBootstrapConfig();
  return await getSystemConfig(bootstrapConfig);
})();
