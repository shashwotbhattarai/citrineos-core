// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use strict';

/** @type {import('sequelize-cli').Migration} */
import { QueryInterface, DataTypes } from 'sequelize';

const TABLE_NAME = 'Transactions';

export = {
  up: async (queryInterface: QueryInterface) => {
    const tableDescription = await queryInterface.describeTable(TABLE_NAME);

    // Add paymentStatus ENUM column
    if (!tableDescription['paymentStatus']) {
      // Create ENUM type first
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE "enum_Transactions_paymentStatus" AS ENUM ('NOT_REQUIRED', 'QUEUED', 'QUEUE_FAILED', 'COMPLETED', 'FAILED');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      await queryInterface.addColumn(TABLE_NAME, 'paymentStatus', {
        type: DataTypes.ENUM('NOT_REQUIRED', 'QUEUED', 'QUEUE_FAILED', 'COMPLETED', 'FAILED'),
        allowNull: true,
        defaultValue: null,
      });
    }

    // Add paymentIdempotencyKey UUID column (unique)
    if (!tableDescription['paymentIdempotencyKey']) {
      await queryInterface.addColumn(TABLE_NAME, 'paymentIdempotencyKey', {
        type: DataTypes.UUID,
        allowNull: true,
        unique: true,
      });
    }

    // Add walletTransactionId STRING column
    if (!tableDescription['walletTransactionId']) {
      await queryInterface.addColumn(TABLE_NAME, 'walletTransactionId', {
        type: DataTypes.STRING(255),
        allowNull: true,
      });
    }

    // Add paymentCompletedAt TIMESTAMP column
    if (!tableDescription['paymentCompletedAt']) {
      await queryInterface.addColumn(TABLE_NAME, 'paymentCompletedAt', {
        type: DataTypes.DATE,
        allowNull: true,
      });
    }

    // Add paymentErrorMessage TEXT column
    if (!tableDescription['paymentErrorMessage']) {
      await queryInterface.addColumn(TABLE_NAME, 'paymentErrorMessage', {
        type: DataTypes.TEXT,
        allowNull: true,
      });
    }

    // Add sqsMessageId STRING column
    if (!tableDescription['sqsMessageId']) {
      await queryInterface.addColumn(TABLE_NAME, 'sqsMessageId', {
        type: DataTypes.STRING(255),
        allowNull: true,
      });
    }

    // Add walletProvider STRING column (e.g., 'yatri', 'esewa', 'khalti')
    if (!tableDescription['walletProvider']) {
      await queryInterface.addColumn(TABLE_NAME, 'walletProvider', {
        type: DataTypes.STRING(100),
        allowNull: true,
      });
    }

    // Add index on paymentStatus for querying
    try {
      await queryInterface.addIndex(TABLE_NAME, ['paymentStatus'], {
        name: 'idx_transactions_payment_status',
      });
    } catch (error) {
      // Index might already exist
    }
  },

  down: async (queryInterface: QueryInterface) => {
    const tableDescription = await queryInterface.describeTable(TABLE_NAME);

    // Remove index
    try {
      await queryInterface.removeIndex(TABLE_NAME, 'idx_transactions_payment_status');
    } catch (error) {
      // Index might not exist
    }

    // Remove columns in reverse order
    if (tableDescription['walletProvider']) {
      await queryInterface.removeColumn(TABLE_NAME, 'walletProvider');
    }
    if (tableDescription['sqsMessageId']) {
      await queryInterface.removeColumn(TABLE_NAME, 'sqsMessageId');
    }
    if (tableDescription['paymentErrorMessage']) {
      await queryInterface.removeColumn(TABLE_NAME, 'paymentErrorMessage');
    }
    if (tableDescription['paymentCompletedAt']) {
      await queryInterface.removeColumn(TABLE_NAME, 'paymentCompletedAt');
    }
    if (tableDescription['walletTransactionId']) {
      await queryInterface.removeColumn(TABLE_NAME, 'walletTransactionId');
    }
    if (tableDescription['paymentIdempotencyKey']) {
      await queryInterface.removeColumn(TABLE_NAME, 'paymentIdempotencyKey');
    }
    if (tableDescription['paymentStatus']) {
      await queryInterface.removeColumn(TABLE_NAME, 'paymentStatus');
    }

    // Drop ENUM type
    await queryInterface.sequelize.query(`
      DROP TYPE IF EXISTS "enum_Transactions_paymentStatus";
    `);
  },
};
