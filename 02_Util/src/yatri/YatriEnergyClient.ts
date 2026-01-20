/**
 * Yatri Energy Backend HTTP Client Service
 * Handles wallet integration for CitrineOS charging operations
 */

import { ILogObj, Logger } from 'tslog';

export interface WalletBalance {
  idToken: string;
  balance: number;
  currency: string;
  status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
  minimumBalance: number;
  lastUpdated: string;
}

export interface PaymentRequest {
  idToken: string;
  amount: number;
  currency: string;
  transactionId?: number;
  stationId?: string;
  description?: string;
  additionalData?: Record<string, any>;
}

export interface PaymentResponse {
  status: 'COMPLETED' | 'FAILED' | 'PENDING';
  message: string;
  yatriWalletId: string;
  yatriWalletOwnerId: string;
  yatriWalletTransactionId: string;
  amount: number;
  currency: string;
  newBalance: number;
  timestamp: string;
  remarks: {};
  additionalData?: Record<string, any>;
}

export class YatriEnergyClient {
  private readonly _logger: Logger<ILogObj>;
  private readonly _baseUrl: string;
  private readonly _timeout: number;
  private readonly _apiKey?: string;

  constructor(baseUrl: string, timeout: number = 10000, apiKey?: string, logger?: Logger<ILogObj>) {
    this._baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this._timeout = timeout;
    this._apiKey = apiKey;
    this._logger = logger || new Logger<ILogObj>({ name: 'YatriEnergyClient' });
  }

  /**
   * Get wallet balance for an idToken
   */
  async getWalletBalance(idToken: string): Promise<WalletBalance | null> {
    try {
      // Convert idToken to lowercase for consistent API calls
      // Different chargers may send tokens in different cases (e.g., D6A3FA03 vs d6a3fa03)
      const normalizedIdToken = idToken.toLowerCase();
      const url = `${this._baseUrl}/wallet/idToken/${encodeURIComponent(normalizedIdToken)}`;

      this._logger.debug(`Fetching wallet balance for idToken: ${idToken}`, { url });

      const response = await this._makeRequest('GET', url);

      if (!response.ok) {
        this._logger.warn(
          `Wallet balance request failed: ${response.status} ${response.statusText}`,
        );
        return null;
      }

      const data = await response.json();

      // Transform response to match our interface
      const walletBalance: WalletBalance = {
        idToken: data.data?.idToken || idToken,
        balance: parseFloat(data.data?.balance) || 0,
        currency: data.data?.currency || 'NPR',
        status: data.data?.status || 'INACTIVE',
        minimumBalance: parseFloat(data.data?.minimumBalance) || 0,
        lastUpdated: data.data?.lastUpdated || new Date().toISOString(),
      };

      this._logger.debug(`Wallet balance retrieved successfully`, {
        idToken,
        balance: walletBalance.balance,
        status: walletBalance.status,
      });

      return walletBalance;
    } catch (error) {
      this._logger.error(`Failed to get wallet balance for idToken: ${idToken}`, error);
      return null;
    }
  }

  /**
   * Check if wallet has sufficient minimum balance
   */
  async checkMinimumBalance(idToken: string, minimumRequired: number): Promise<boolean> {
    try {
      const wallet = await this.getWalletBalance(idToken);

      if (!wallet) {
        this._logger.warn(`Wallet not found for idToken: ${idToken}`);
        return false;
      }

      if (wallet.status !== 'ACTIVE') {
        this._logger.warn(`Wallet is not active for idToken: ${idToken}`, {
          status: wallet.status,
        });
        return false;
      }

      const hasMinimumBalance = wallet.balance >= minimumRequired;

      this._logger.debug(`Minimum balance check result`, {
        idToken,
        balance: wallet.balance,
        minimumRequired,
        hasMinimumBalance,
      });

      return hasMinimumBalance;
    } catch (error) {
      this._logger.error(`Failed to check minimum balance for idToken: ${idToken}`, error);
      return false;
    }
  }

  /**
   * Process payment after charging completion
   */
  async makePayment(paymentRequest: PaymentRequest): Promise<PaymentResponse | null> {
    try {
      const url = `${this._baseUrl}/wallet/make-payment`;

      // Convert idToken to lowercase for consistent API calls
      // Different chargers may send tokens in different cases (e.g., D6A3FA03 vs d6a3fa03)
      const normalizedIdToken = paymentRequest.idToken.toLowerCase();

      // Transform payload to match Yatri backend API schema
      const yatriPayload = {
        platform: 'ENERGY',
        transactionType: 'DEBIT',
        idToken: normalizedIdToken,
        transactionAmount: paymentRequest.amount,
        currency: paymentRequest.currency,
        remarks: paymentRequest.description,
        initiatedBy: normalizedIdToken,
        serviceCharge: 0,
        discount: 0,
        taxRate: 0,
        additionalData: paymentRequest.additionalData,
        taxCalculationMethod: 'EXCLUSIVE',
      };

      this._logger.debug(`Processing payment`, {
        idToken: paymentRequest.idToken,
        originalAmount: paymentRequest.amount,
        transformedPayload: yatriPayload,
        url: url,
      });

      const response = await this._makeRequest('POST', url, yatriPayload);

      if (!response) {
        this._logger.error(`No response received from Yatri backend`);
        return null;
      }

      this._logger.debug(`Yatri backend response: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        this._logger.warn(`Payment request failed: ${response.status} ${response.statusText}`, {
          errorText,
        });
        return null;
      }

      const responseData = await response.json();

      const paymentResponse: PaymentResponse = {
        status: responseData.data.status,
        message: responseData.message,
        yatriWalletTransactionId: responseData.data.id,
        yatriWalletId: responseData.data.walletId,
        yatriWalletOwnerId: responseData.data.ownerId,
        amount: responseData.data.totalTransactionAmount,
        currency: responseData.data.currency,
        newBalance: responseData.data.newBalance,
        timestamp: responseData.data.createdAt,
        remarks: responseData.data.remarks,
        additionalData: responseData.data.additionalData,
      };

      this._logger.info(`Payment processed successfully`, paymentResponse);

      return paymentResponse;
    } catch (error) {
      this._logger.error(`Failed to process payment`, {
        paymentRequest: {
          idToken: paymentRequest.idToken,
          amount: paymentRequest.amount,
          transactionId: paymentRequest.transactionId,
          url: `${this._baseUrl}/wallet/make-payment`,
        },
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Internal method to make HTTP requests
   */
  private async _makeRequest(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    body?: any,
  ): Promise<Response> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'CitrineOS-YatriEnergyClient/1.0',
      };

      if (this._apiKey) {
        headers['Authorization'] = `Bearer ${this._apiKey}`;
      }

      const requestOptions: RequestInit = {
        method,
        headers,
        signal: AbortSignal.timeout(this._timeout),
      };

      if (body && (method === 'POST' || method === 'PUT')) {
        requestOptions.body = JSON.stringify(body);
      }

      this._logger.debug(`Making ${method} request to ${url}`);

      const response = await fetch(url, requestOptions);

      if (!response) {
        throw new Error('Fetch returned undefined response');
      }

      return response;
    } catch (error) {
      this._logger.error(`HTTP request failed: ${method} ${url}`, error);
      throw error;
    }
  }

  /**
   * Health check for Yatri Energy backend
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this._makeRequest('GET', `${this._baseUrl}/health`);
      return response.ok;
    } catch (error) {
      this._logger.error(`Yatri Energy health check failed`, error);
      return false;
    }
  }
}
