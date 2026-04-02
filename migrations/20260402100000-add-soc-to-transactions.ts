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

    if (!tableDescription['startSoc']) {
      await queryInterface.addColumn(TABLE_NAME, 'startSoc', {
        type: DataTypes.DECIMAL,
        allowNull: true,
      });
    }

    if (!tableDescription['endSoc']) {
      await queryInterface.addColumn(TABLE_NAME, 'endSoc', {
        type: DataTypes.DECIMAL,
        allowNull: true,
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    const tableDescription = await queryInterface.describeTable(TABLE_NAME);

    if (tableDescription['endSoc']) {
      await queryInterface.removeColumn(TABLE_NAME, 'endSoc');
    }

    if (tableDescription['startSoc']) {
      await queryInterface.removeColumn(TABLE_NAME, 'startSoc');
    }
  },
};
