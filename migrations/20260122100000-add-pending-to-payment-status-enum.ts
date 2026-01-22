// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use strict';

/**
 * Migration to add PENDING status to paymentStatus enum.
 *
 * This migration handles the case where the original migration (20260122000000)
 * already ran without PENDING. It safely adds PENDING to the existing enum.
 *
 * If PENDING already exists (fresh install), this migration does nothing.
 */

/** @type {import('sequelize-cli').Migration} */
import { QueryInterface } from 'sequelize';

export = {
  up: async (queryInterface: QueryInterface) => {
    // Check if PENDING already exists in the enum
    const [results] = await queryInterface.sequelize.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'PENDING'
        AND enumtypid = (
          SELECT oid FROM pg_type WHERE typname = 'enum_Transactions_paymentStatus'
        )
      ) as pending_exists;
    `);

    const pendingExists = (results as any[])[0]?.pending_exists;

    if (!pendingExists) {
      // Add PENDING to the enum (insert at the beginning)
      await queryInterface.sequelize.query(`
        ALTER TYPE "enum_Transactions_paymentStatus" ADD VALUE IF NOT EXISTS 'PENDING' BEFORE 'NOT_REQUIRED';
      `);

      // Update existing NULL values to PENDING (for active transactions)
      await queryInterface.sequelize.query(`
        UPDATE "Transactions"
        SET "paymentStatus" = 'PENDING'
        WHERE "paymentStatus" IS NULL AND "isActive" = false;
      `);

      // Set default value for new rows
      await queryInterface.sequelize.query(`
        ALTER TABLE "Transactions"
        ALTER COLUMN "paymentStatus" SET DEFAULT 'PENDING';
      `);

      console.log('Added PENDING to paymentStatus enum and set as default');
    } else {
      console.log('PENDING already exists in paymentStatus enum, skipping');
    }
  },

  down: async (queryInterface: QueryInterface) => {
    // Note: PostgreSQL doesn't support removing enum values easily
    // We just remove the default, the PENDING value remains in the enum
    await queryInterface.sequelize.query(`
      ALTER TABLE "Transactions"
      ALTER COLUMN "paymentStatus" DROP DEFAULT;
    `);

    console.log('Removed PENDING default (enum value remains)');
  },
};
