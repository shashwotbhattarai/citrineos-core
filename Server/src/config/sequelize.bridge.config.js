// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
require('ts-node/register');

module.exports = (async () => {
  const { loadBootstrapConfig } = require('./bootstrap.config');

  try {
    const bootstrapConfig = loadBootstrapConfig();

    const { host, port, database, dialect, username, password, ssl } = bootstrapConfig.database;

    console.log('[sequelize.bridge.config.js] Loaded config for DB:', {
      host,
      port,
      database,
      dialect,
      ssl,
    });

    const config = {
      username,
      password,
      database,
      host,
      port,
      dialect,
      logging: true,
    };

    // Add SSL configuration if enabled
    if (ssl) {
      config.dialectOptions = {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
      };
    }

    return config;
  } catch (error) {
    console.error('[sequelize.bridge.config.js] Failed to load bootstrap configuration:', error);
    throw error;
  }
})();
