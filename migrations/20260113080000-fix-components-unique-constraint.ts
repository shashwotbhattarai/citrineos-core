// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use strict';

/** @type {import('sequelize-cli').Migration} */
import { QueryInterface } from 'sequelize';

export = {
  up: async (queryInterface: QueryInterface) => {
    // Fix Components unique constraint to include tenantId for multi-tenant support
    // The old constraint only had 'name' which prevented multiple tenants from having
    // the same component (e.g., SecurityCtrlr)

    // Drop the old unique index on 'name' only
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS "Components_name";');

    // Create new unique index on 'name' and 'tenantId' for proper multi-tenant isolation
    await queryInterface.sequelize.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "Components_name_tenantId" ON "Components" ("name", "tenantId") WHERE instance IS NULL;',
    );
  },

  down: async (queryInterface: QueryInterface) => {
    // Revert: Drop the new index and recreate the old one
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS "Components_name_tenantId";');

    await queryInterface.sequelize.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "Components_name" ON "Components" ("name") WHERE instance IS NULL;',
    );
  },
};
