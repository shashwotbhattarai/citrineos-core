// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { type BootstrapConfig, CrudRepository } from '@citrineos/base';
import { type Model, type Sequelize } from 'sequelize-typescript';
import { DefaultSequelizeInstance } from '../util';
import { type ILogObj, Logger } from 'tslog';
import {
  AggregateOptions,
  Attributes,
  FindAndCountOptions,
  FindOptions,
  ModelStatic,
  QueryTypes,
  UpdateOptions,
} from 'sequelize';

export class SequelizeRepository<T extends Model<any, any>> extends CrudRepository<T> {
  protected s: Sequelize;
  protected namespace: string;
  protected logger: Logger<ILogObj>;

  constructor(
    config: BootstrapConfig,
    namespace: string,
    logger?: Logger<ILogObj>,
    sequelizeInstance?: Sequelize,
  ) {
    super();
    this.s = sequelizeInstance ?? DefaultSequelizeInstance.getInstance(config, logger);
    this.namespace = namespace;
    this.logger = logger
      ? logger.getSubLogger({ name: this.constructor.name })
      : new Logger<ILogObj>({ name: this.constructor.name });
  }

  async readByKey(
    tenantId: number,
    key: string | number,
    namespace: string = this.namespace,
  ): Promise<T | undefined> {
    return await this.s.models[namespace]
      .findOne({
        where: {
          [this.s.models[namespace].primaryKeyAttribute]: key,
          tenantId,
        },
      } as FindOptions<any>)
      .then((row) => row as T | undefined);
  }

  async readAllByQuery(
    tenantId: number,
    query: object,
    namespace: string = this.namespace,
  ): Promise<T[]> {
    const queryWithTenant = this._addTenantIdToQuery(query, tenantId);
    return await this.s.models[namespace]
      .findAll(queryWithTenant as FindOptions<any>)
      .then((row) => row as T[]);
  }

  async readAllBySqlString(
    tenantId: number,
    sqlString: string,
    namespace: string = this.namespace,
  ): Promise<object[]> {
    return await this.s.query(`${sqlString}`, { type: QueryTypes.SELECT });
  }

  async readNextValue(
    tenantId: number,
    columnName: string,
    query?: object,
    startValue?: number,
    namespace: string = this.namespace,
  ): Promise<number> {
    const options = query ? (query as AggregateOptions<any>) : undefined;
    const maxValue = await this.s.models[namespace].max(columnName, options);
    if (maxValue === null || maxValue === undefined) {
      // maxValue can be 0, so we need to specifically check for null or undefined
      return startValue ?? 1;
    }
    if (typeof maxValue !== 'number' || isNaN(maxValue)) {
      throw new Error(`Max value ${maxValue} on ${columnName} is invalid.`);
    }
    return maxValue + 1;
  }

  async existsByKey(
    tenantId: number,
    key: string,
    namespace: string = this.namespace,
  ): Promise<boolean> {
    return await this.s.models[namespace]
      .findOne({
        where: {
          [this.s.models[namespace].primaryKeyAttribute]: key,
          tenantId,
        },
      } as FindOptions<any>)
      .then((row) => row !== null);
  }

  async existByQuery(
    tenantId: number,
    query: object,
    namespace: string = this.namespace,
  ): Promise<number> {
    const queryWithTenant = this._addTenantIdToQuery(query, tenantId);
    return await this.s.models[namespace].findAll(queryWithTenant).then((row) => row.length);
  }

  async findAndCount(
    tenantId: number,
    options: Omit<FindAndCountOptions<Attributes<T>>, 'group'>,
    namespace: string = this.namespace,
  ): Promise<{ rows: T[]; count: number }> {
    const optionsWithTenant = this._addTenantIdToQuery(options, tenantId);
    return (this.s.models[namespace] as ModelStatic<T>).findAndCountAll(
      optionsWithTenant as Omit<FindAndCountOptions<Attributes<T>>, 'group'>,
    );
  }

  protected async _create(
    tenantId: number,
    value: T,
    namespace: string = this.namespace,
  ): Promise<T> {
    return await value.save();
  }

  protected async _bulkCreate(
    tenantId: number,
    values: T[],
    namespace: string = this.namespace,
  ): Promise<T[]> {
    return await (this.s.models[namespace] as ModelStatic<T>).bulkCreate(values as any);
  }

  protected async _createByKey(
    tenantId: number,
    value: T,
    key: string,
    namespace: string = this.namespace,
  ): Promise<T> {
    const primaryKey = this.s.models[namespace].primaryKeyAttribute;
    value.setDataValue(primaryKey, key);
    return (await this.s.models[namespace].create(value.toJSON())) as T;
  }

  protected async _readOrCreateByQuery(
    tenantId: number,
    query: object,
    namespace: string = this.namespace,
  ): Promise<[T, boolean]> {
    const queryWithTenant = this._addTenantIdToQuery(query, tenantId);
    return await this.s.models[namespace]
      .findOrCreate(queryWithTenant as FindOptions<any>)
      .then((result) => [result[0] as T, result[1]]);
  }

  protected async _updateByKey(
    tenantId: number,
    value: Partial<T>,
    key: string,
    namespace: string = this.namespace,
  ): Promise<T | undefined> {
    const primaryKey = this.s.models[namespace].primaryKeyAttribute;
    return await this._updateAllByQuery(
      tenantId,
      value,
      { where: { [primaryKey]: key, tenantId } },
      namespace,
    ).then((rows) => (rows && rows.length === 1 ? rows[0] : undefined));
  }

  protected async _updateAllByQuery(
    tenantId: number,
    value: Partial<T>,
    query: object,
    namespace: string = this.namespace,
  ): Promise<T[]> {
    const queryWithTenant = this._addTenantIdToQuery(query, tenantId);
    const updateOptions = queryWithTenant as UpdateOptions<any>;
    updateOptions.returning = true;
    // Lengthy type conversion to satisfy sequelize-typescript
    return await (this.s.models[namespace] as ModelStatic<T>)
      .update(
        value,
        updateOptions as Omit<UpdateOptions<Attributes<T>>, 'returning'> & {
          returning: Exclude<UpdateOptions<Attributes<T>>['returning'], undefined | false>;
        },
      )
      .then((result) => result[1] as T[]);
  }

  protected async _deleteByKey(
    tenantId: number,
    key: string,
    namespace: string = this.namespace,
  ): Promise<T | undefined> {
    const primaryKey = this.s.models[namespace].primaryKeyAttribute;
    return this.s.transaction(async (transaction) => {
      const entryToDelete = await this.s.models[namespace]
        .findOne({
          where: { [primaryKey]: key, tenantId },
          transaction,
        } as FindOptions<any>)
        .then((row) => row as T);

      if (entryToDelete) {
        await this.s.models[namespace].destroy({
          where: { [primaryKey]: key, tenantId },
          transaction,
        });
        return entryToDelete;
      } else {
        return undefined;
      }
    });
  }

  protected async _deleteAllByQuery(
    tenantId: number,
    query: object,
    namespace: string = this.namespace,
  ): Promise<T[]> {
    const queryWithTenant = this._addTenantIdToQuery(query, tenantId);
    return this.s.transaction(async (transaction) => {
      const entriesToDelete = await this.s.models[namespace]
        .findAll({
          ...queryWithTenant,
          transaction,
        })
        .then((rows) => rows as T[]);

      const deletedCount = await this.s.models[namespace].destroy({
        ...queryWithTenant,
        transaction,
      });

      if (entriesToDelete.length === deletedCount) {
        return entriesToDelete;
      } else {
        throw new Error(`Deleted ${deletedCount} entries, expected ${entriesToDelete.length}`);
      }
    });
  }

  /**
   * Helper method to add tenantId to query where clause.
   * Ensures all database operations are properly filtered by tenant.
   */
  protected _addTenantIdToQuery(query: object, tenantId: number): object {
    const queryObj = query as FindOptions<any>;
    return {
      ...queryObj,
      where: {
        ...queryObj.where,
        tenantId,
      },
    };
  }
}
