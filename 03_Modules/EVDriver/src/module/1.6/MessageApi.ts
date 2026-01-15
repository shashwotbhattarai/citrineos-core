// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { FastifyInstance } from 'fastify';
import { ILogObj, Logger } from 'tslog';
import { IEVDriverModuleApi } from '../interface';
import { EVDriverModule } from '../module';
import {
  AbstractModuleApi,
  AsMessageEndpoint,
  CallAction,
  DEFAULT_TENANT_ID,
  IMessageConfirmation,
  OCPP1_6,
  SystemConfig,
  OCPP1_6_CallAction,
  OCPPVersion,
} from '@citrineos/base';
import { YatriEnergyClient } from '@citrineos/util';

export class EVDriverOcpp16Api
  extends AbstractModuleApi<EVDriverModule>
  implements IEVDriverModuleApi
{
  /**
   * Constructs a new instance of the class.
   *
   * @param {EVDriverModule} evDriverModule - The EVDriver module.
   * @param {FastifyInstance} server - The Fastify server instance.
   * @param {Logger<ILogObj>} [logger] - The logger for logging.
   */
  constructor(evDriverModule: EVDriverModule, server: FastifyInstance, logger?: Logger<ILogObj>) {
    super(evDriverModule, server, OCPPVersion.OCPP1_6, logger);
  }

  @AsMessageEndpoint(
    OCPP1_6_CallAction.RemoteStartTransaction,
    OCPP1_6.RemoteStartTransactionRequestSchema,
  )
  async remoteStartTransaction(
    identifier: string[],
    request: OCPP1_6.RemoteStartTransactionRequest,
    callbackUrl?: string,
    tenantId: number = DEFAULT_TENANT_ID,
  ): Promise<IMessageConfirmation[]> {
    // Normalize idTag to lowercase for consistent authorization lookups
    // Different chargers may send idTokens in different cases (e.g., D6A3FA03 vs d6a3fa03)
    if (request.idTag) {
      request.idTag = request.idTag.toLowerCase();
    }

    // Check wallet balance for remote start transactions (Yatri Energy Integration)
    if (request.idTag) {
      const walletCheckPassed = await this._checkYatriWalletBalance(request.idTag, tenantId);
      if (!walletCheckPassed) {
        // Return rejection response for all identifiers
        return identifier.map((id) => ({
          success: false,
          payload: {
            status: OCPP1_6.RemoteStartTransactionResponseStatus.Rejected,
          },
          callMessageId: '',
          callbackUrl,
          context: {
            stationId: id,
            tenantId,
            correlationId: '',
            timestamp: new Date().toISOString(),
          },
        }));
      }
    }

    const results = identifier.map((id) =>
      this._module.sendCall(
        id,
        tenantId,
        OCPPVersion.OCPP1_6,
        OCPP1_6_CallAction.RemoteStartTransaction,
        request,
        callbackUrl,
      ),
    );
    return Promise.all(results);
  }

  @AsMessageEndpoint(
    OCPP1_6_CallAction.RemoteStopTransaction,
    OCPP1_6.RemoteStopTransactionRequestSchema,
  )
  async remoteStopTransaction(
    identifier: string[],
    request: OCPP1_6.RemoteStopTransactionRequest,
    callbackUrl?: string,
    tenantId: number = DEFAULT_TENANT_ID,
  ): Promise<IMessageConfirmation[]> {
    // Log remote stop for Yatri Energy integration tracking
    this._logger.info(`Remote stop transaction initiated`, {
      transactionId: request.transactionId,
      identifiers: identifier,
      tenantId,
      note: 'Payment settlement will be processed when charging station sends StopTransaction message',
    });

    const results = identifier.map((id) =>
      this._module.sendCall(
        id,
        tenantId,
        OCPPVersion.OCPP1_6,
        OCPP1_6_CallAction.RemoteStopTransaction,
        request,
        callbackUrl,
      ),
    );
    return Promise.all(results);
  }

  @AsMessageEndpoint(OCPP1_6_CallAction.UnlockConnector, OCPP1_6.UnlockConnectorRequestSchema)
  async unlockConnector(
    identifier: string[],
    request: OCPP1_6.UnlockConnectorRequest,
    callbackUrl?: string,
    tenantId: number = DEFAULT_TENANT_ID,
  ): Promise<IMessageConfirmation[]> {
    const results = identifier.map((id) =>
      this._module.sendCall(
        id,
        tenantId,
        OCPPVersion.OCPP1_6,
        OCPP1_6_CallAction.UnlockConnector,
        request,
        callbackUrl,
      ),
    );
    return Promise.all(results);
  }

  /**
   * Check wallet balance using Yatri Energy backend for remote start transactions
   */
  private async _checkYatriWalletBalance(idToken: string, tenantId: number): Promise<boolean> {
    try {
      // Get system configuration to check if Yatri Energy integration is enabled
      const config = this._module.config as SystemConfig;
      if (!config.yatriEnergy?.enabled) {
        this._logger.debug('Yatri Energy wallet integration is disabled, skipping wallet check');
        return true; // Skip wallet check if integration is disabled
      }

      // Create Yatri Energy client
      const yatriClient = new YatriEnergyClient(
        config.yatriEnergy.baseUrl,
        config.yatriEnergy.timeout,
        config.yatriEnergy.apiKey,
        this._logger,
      );

      // Check minimum balance using the YatriEnergyClient method
      const hasMinimumBalance = await yatriClient.checkMinimumBalance(
        idToken,
        config.yatriEnergy.minimumBalance,
      );

      if (!hasMinimumBalance) {
        this._logger.warn(`Wallet balance check failed for remote start idToken: ${idToken}`, {
          minimumRequired: config.yatriEnergy.minimumBalance,
          tenantId,
        });
        return false;
      }

      this._logger.debug(`Wallet balance check passed for remote start idToken: ${idToken}`, {
        minimumRequired: config.yatriEnergy.minimumBalance,
        tenantId,
      });

      return true;
    } catch (error) {
      this._logger.error(
        `Yatri Energy wallet check failed for remote start idToken: ${idToken}`,
        error,
      );
      // On error, allow the transaction to proceed (fail-safe behavior)
      return true;
    }
  }

  /**
   * Overrides superclass method to generate the URL path based on the input {@link CallAction}
   * and the module's endpoint prefix configuration.
   *
   * @param {CallAction} input - The input {@link CallAction}.
   * @return {string} - The generated URL path.
   */
  protected _toMessagePath(input: CallAction): string {
    const endpointPrefix = this._module.config.modules.evdriver.endpointPrefix;
    return super._toMessagePath(input, endpointPrefix);
  }
}
