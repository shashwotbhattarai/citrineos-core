// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { FastifyRequest } from 'fastify';
import { ILogObj, Logger } from 'tslog';
import {
  ApiAuthenticationResult,
  ApiAuthorizationResult,
  IApiAuthProvider,
  UserInfo,
} from '@citrineos/base';

/**
 * API Key authentication provider for service-to-service communication.
 * Validates requests using a shared secret sent via the X-API-Key header.
 */
export class ApiKeyAuthProvider implements IApiAuthProvider {
  private readonly _logger: Logger<ILogObj>;
  private readonly _apiKey: string;

  constructor(apiKey: string, logger?: Logger<ILogObj>) {
    this._apiKey = apiKey;
    this._logger = logger
      ? logger.getSubLogger({ name: this.constructor.name })
      : new Logger<ILogObj>({ name: this.constructor.name });

    if (!apiKey || apiKey.length < 16) {
      this._logger.warn('API key is short (< 16 chars). Use a strong, random key in production.');
    }

    this._logger.info('ApiKeyAuthProvider initialized');
  }

  async extractToken(request: FastifyRequest): Promise<string | null> {
    const apiKey = request.headers['x-api-key'];
    if (typeof apiKey === 'string' && apiKey.length > 0) {
      return apiKey;
    }
    this._logger.debug('No X-API-Key header found in request');
    return null;
  }

  async authenticateToken(token: string): Promise<ApiAuthenticationResult> {
    if (token === this._apiKey) {
      const user: UserInfo = {
        id: 'api-key-service',
        name: 'API Key Service',
        email: 'service@internal',
        roles: ['admin'],
        tenantId: '1',
      };
      return ApiAuthenticationResult.success(user);
    }

    this._logger.warn('Invalid API key received');
    return ApiAuthenticationResult.failure('Invalid API key');
  }

  async authorizeUser(_user: UserInfo, _request: FastifyRequest): Promise<ApiAuthorizationResult> {
    return ApiAuthorizationResult.success();
  }
}
