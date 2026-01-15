// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { BootstrapConfig } from '@citrineos/base';
import { type AuthorizationQuerystring, type IAuthorizationRepository } from '../../../interfaces';
import { Authorization } from '../model/Authorization';
import { SequelizeRepository } from './Base';
import { Sequelize } from 'sequelize-typescript';
import { fn, where, col } from 'sequelize';
import { ILogObj, Logger } from 'tslog';

export class SequelizeAuthorizationRepository
  extends SequelizeRepository<Authorization>
  implements IAuthorizationRepository
{
  constructor(config: BootstrapConfig, logger?: Logger<ILogObj>, sequelizeInstance?: Sequelize) {
    super(config, Authorization.MODEL_NAME, logger, sequelizeInstance);
  }

  async readAllByQuerystring(
    tenantId: number,
    query: AuthorizationQuerystring,
  ): Promise<Authorization[]> {
    return await super.readAllByQuery(tenantId, this._constructQuery(query));
  }

  async readOnlyOneByQuerystring(
    tenantId: number,
    query: AuthorizationQuerystring,
  ): Promise<Authorization | undefined> {
    return await super.readOnlyOneByQuery(tenantId, this._constructQuery(query));
  }

  /**
   * Private Methods
   */

  private _constructQuery(queryParams: AuthorizationQuerystring): object {
    // 1.6 doesn't have the concept of token type. But we need to support token type for 2.0.1 messages.
    // We ignore token type if it's explicitly set to null, as it's coming from a 1.6 message

    const whereClause: any = {};

    if (queryParams.idToken) {
      // Case-insensitive exact match using LOWER function
      // This handles chargers that send idTokens in different cases (e.g., D6A3FA03 vs d6a3fa03)
      whereClause.idToken = where(fn('LOWER', col('idToken')), queryParams.idToken.toLowerCase());
    }

    // only include type if it's provided
    if (queryParams.type) {
      whereClause.idTokenType = queryParams.type;
    }

    return {
      where: whereClause,
    };
  }
}
