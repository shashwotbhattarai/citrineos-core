// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use strict';

/** @type {import('sequelize-cli').Migration} */
import { QueryInterface } from 'sequelize';

export = {
  up: async (queryInterface: QueryInterface) => {
    // Fix Components unique constraints to include tenantId for multi-tenant support
    // The old constraints only had 'name' or 'name+instance' which prevented multiple
    // tenants from having the same component (e.g., SecurityCtrlr)
    // NOTE: Variables fixes are in a separate migration (20260113091800-fix-variables-unique-constraint.ts)

    // 1. Drop the old unique index on 'name' only (lowercase - PostgreSQL default)
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS components_name;');
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS "Components_name";');

    // 2. Drop the old constraint on 'name' + 'instance' (without tenantId)
    await queryInterface.sequelize.query(
      'ALTER TABLE "Components" DROP CONSTRAINT IF EXISTS "Components_name_instance_key";',
    );

    // 3. Create new unique index on 'name' + 'tenantId' for null instance
    await queryInterface.sequelize.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "Components_name_tenantId" ON "Components" ("name", "tenantId") WHERE instance IS NULL;',
    );

    // 4. Create new unique constraint on 'name' + 'instance' + 'tenantId'
    await queryInterface.sequelize.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "Components_name_instance_tenantId_key" ON "Components" ("name", "instance", "tenantId");',
    );
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS "Components_name_tenantId";');
    await queryInterface.sequelize.query(
      'DROP INDEX IF EXISTS "Components_name_instance_tenantId_key";',
    );
    await queryInterface.sequelize.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS components_name ON "Components" ("name") WHERE instance IS NULL;',
    );
    await queryInterface.sequelize.query(
      'ALTER TABLE "Components" ADD CONSTRAINT "Components_name_instance_key" UNIQUE ("name", "instance");',
    );
  },
};
