// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use strict';

/**
 * Migration to add performance indexes on high-volume tables.
 *
 * These tables were missing indexes on columns frequently used in WHERE clauses
 * (tenantId, stationId, isActive, transactionDatabaseId, correlationId),
 * causing full table scans on every query.
 */

/** @type {import('sequelize-cli').Migration} */
import { QueryInterface } from 'sequelize';

const INDEXES = [
  // Transactions — filtered by tenantId + stationId + isActive in nearly every query
  `CREATE INDEX IF NOT EXISTS "idx_transactions_tenant_station_active" ON "Transactions" ("tenantId", "stationId", "isActive")`,
  `CREATE INDEX IF NOT EXISTS "idx_transactions_tenant_transactionid" ON "Transactions" ("tenantId", "transactionId")`,

  // MeterValues — zero indexes currently, joined via transactionDatabaseId
  `CREATE INDEX IF NOT EXISTS "idx_metervalues_tenant_txndbid" ON "MeterValues" ("tenantId", "transactionDatabaseId")`,
  `CREATE INDEX IF NOT EXISTS "idx_metervalues_txneventid" ON "MeterValues" ("transactionEventId")`,

  // TransactionEvents — joined via transactionDatabaseId, filtered by stationId
  `CREATE INDEX IF NOT EXISTS "idx_txnevents_tenant_txndbid" ON "TransactionEvents" ("tenantId", "transactionDatabaseId")`,
  `CREATE INDEX IF NOT EXISTS "idx_txnevents_tenant_stationid" ON "TransactionEvents" ("tenantId", "stationId")`,

  // StatusNotifications — filtered by stationId
  `CREATE INDEX IF NOT EXISTS "idx_statusnotif_tenant_stationid" ON "StatusNotifications" ("tenantId", "stationId")`,
  `CREATE INDEX IF NOT EXISTS "idx_latestsn_tenant_stationid" ON "LatestStatusNotifications" ("tenantId", "stationId")`,

  // ChargingStations — isOnline queried by dashboard
  `CREATE INDEX IF NOT EXISTS "idx_chgstations_tenant_isonline" ON "ChargingStations" ("tenantId", "isOnline")`,

  // OCPPMessages — correlation lookup during message logging
  `CREATE INDEX IF NOT EXISTS "idx_ocppmsg_tenant_station_corr" ON "OCPPMessages" ("tenantId", "stationId", "correlationId")`,

  // Foreign key joins — Evses and Connectors
  `CREATE INDEX IF NOT EXISTS "idx_evses_tenant_stationid" ON "Evses" ("tenantId", "stationId")`,
  `CREATE INDEX IF NOT EXISTS "idx_connectors_tenant_stationid" ON "Connectors" ("tenantId", "stationId")`,
];

export = {
  up: async (queryInterface: QueryInterface) => {
    for (const sql of INDEXES) {
      try {
        await queryInterface.sequelize.query(sql);
      } catch (error) {
        // Log but continue — IF NOT EXISTS handles duplicates,
        // but table might not exist in fresh installs with different schema
        console.warn(`Index creation warning: ${error}`);
      }
    }
    console.log(`Created ${INDEXES.length} performance indexes`);
  },

  down: async (queryInterface: QueryInterface) => {
    const indexNames = [
      'idx_transactions_tenant_station_active',
      'idx_transactions_tenant_transactionid',
      'idx_metervalues_tenant_txndbid',
      'idx_metervalues_txneventid',
      'idx_txnevents_tenant_txndbid',
      'idx_txnevents_tenant_stationid',
      'idx_statusnotif_tenant_stationid',
      'idx_latestsn_tenant_stationid',
      'idx_chgstations_tenant_isonline',
      'idx_ocppmsg_tenant_station_corr',
      'idx_evses_tenant_stationid',
      'idx_connectors_tenant_stationid',
    ];
    for (const name of indexNames) {
      await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "${name}"`);
    }
    console.log(`Dropped ${indexNames.length} performance indexes`);
  },
};
