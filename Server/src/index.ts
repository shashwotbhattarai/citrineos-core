// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import {
  type AbstractModule,
  Ajv,
  BootstrapConfig,
  ConfigStoreFactory,
  EventGroup,
  eventGroupFromString,
  IApiAuthProvider,
  type IAuthenticator,
  IAuthorizer,
  type ICache,
  type IFileStorage,
  type IMessageHandler,
  type IMessageSender,
  type IModule,
  type IModuleApi,
  loadBootstrapConfig,
  type SystemConfig,
} from '@citrineos/base';
import { MonitoringDataApi, MonitoringModule, MonitoringOcpp201Api } from '@citrineos/monitoring';
import {
  Authenticator,
  BasicAuthenticationFilter,
  CertificateAuthorityService,
  ConnectedStationFilter,
  DirectusUtil,
  IdGenerator,
  initSwagger,
  ApiKeyAuthProvider,
  LocalBypassAuthProvider,
  MemoryCache,
  NetworkProfileFilter,
  OIDCAuthProvider,
  RabbitMqReceiver,
  RabbitMqSender,
  RealTimeAuthorizer,
  RedisCache,
  UnknownStationFilter,
  WebsocketNetworkConnection,
} from '@citrineos/util';
import { type JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts';
import addFormats from 'ajv-formats';
import fastify, { type FastifyInstance, RouteOptions } from 'fastify';
import { type ILogObj, Logger } from 'tslog';
import { getSystemConfig } from './config';
import {
  ConfigurationDataApi,
  ConfigurationModule,
  ConfigurationOcpp16Api,
  ConfigurationOcpp201Api,
} from '@citrineos/configuration';
import {
  TransactionsDataApi,
  TransactionsModule,
  TransactionsOcpp201Api,
  registerPaymentCallbackApi,
} from '@citrineos/transactions';
import {
  CertificatesDataApi,
  CertificatesModule,
  CertificatesOcpp201Api,
} from '@citrineos/certificates';
import {
  EVDriverDataApi,
  EVDriverModule,
  EVDriverOcpp16Api,
  EVDriverOcpp201Api,
} from '@citrineos/evdriver';
import { ReportingModule, ReportingOcpp201Api } from '@citrineos/reporting';
import {
  InternalSmartCharging,
  ISmartCharging,
  SmartChargingModule,
  SmartChargingOcpp201Api,
} from '@citrineos/smartcharging';
import { RepositoryStore, sequelize, Sequelize, ServerNetworkProfile } from '@citrineos/data';
import {
  type FastifyRouteSchemaDef,
  type FastifySchemaCompiler,
  type FastifyValidationResult,
} from 'fastify/types/schema';
import { AdminApi, MessageRouterImpl, WebhookDispatcher } from '@citrineos/ocpprouter';
import cors from '@fastify/cors';
import ApiAuthPlugin from '@citrineos/util/dist/authorization/ApiAuthPlugin';
import * as amqplib from 'amqplib';
import { HeadBucketCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';

export class CitrineOSServer {
  /**
   * Fields
   */
  private readonly _bootstrapConfig: BootstrapConfig;
  private readonly _systemConfig: SystemConfig;
  private readonly _logger: Logger<ILogObj>;
  private readonly _server: FastifyInstance;
  private readonly _cache: ICache;
  private readonly _ajv: Ajv;
  private readonly _fileStorage: IFileStorage;
  private readonly modules: IModule[] = [];
  private readonly apis: IModuleApi[] = [];
  private _sequelizeInstance!: Sequelize;
  private host?: string;
  private port?: number;
  private eventGroup?: EventGroup;
  private _authenticator?: IAuthenticator;
  private _networkConnection?: WebsocketNetworkConnection;
  private _repositoryStore!: RepositoryStore;
  private _idGenerator!: IdGenerator;
  private _certificateAuthorityService!: CertificateAuthorityService;
  private _smartChargingService!: ISmartCharging;
  private _realTimeAuthorizer!: IAuthorizer;

  private readonly appName: string;

  /**
   * Constructor for the class.
   *
   * @param {EventGroup} appName - app type
   * @param {SystemConfig} systemConfig - config
   * @param {FastifyInstance} server - optional Fastify server instance
   * @param {Ajv} ajv - optional Ajv JSON schema validator instance
   * @param {ICache} cache - cache
   * @param {IFileStorage} _fileStorage - file storage
   */
  // todo rename event group to type
  constructor(
    appName: string,
    bootstrapConfig: BootstrapConfig,
    systemConfig: SystemConfig,
    server?: FastifyInstance,
    ajv?: Ajv,
    cache?: ICache,
    _fileStorage?: IFileStorage,
  ) {
    if (!bootstrapConfig.amqp?.url) {
      throw new Error(
        'AMQP URL is required for RabbitMQ configuration (AMQP_URL env var missing).',
      );
    }

    this.appName = appName;
    this._bootstrapConfig = bootstrapConfig;
    this._systemConfig = systemConfig;
    this._server = server || fastify().withTypeProvider<JsonSchemaToTsProvider>();

    // enable cors
    (this._server as any).register(cors, {
      origin: true, // This can be customized to specify allowed origins
      methods: ['GET', 'POST', 'PUT', 'DELETE'], // Specify allowed HTTP methods
    });

    console.log('Bootstrap configuration loaded');

    // Create Ajv JSON schema validator instance
    this._ajv = this.initAjv(ajv);
    this.addAjvFormats();

    // Initialize parent logger
    this._logger = this.initLogger();

    // Set cache implementation
    this._cache = this.initCache(cache);

    // Initialize Swagger if enabled
    this.initSwagger()
      .then()
      .catch((error) => this._logger.error('Could not initialize swagger', { error }));

    // Add health check (registered via fastify.register for Swagger compatibility)
    this.initHealthCheck();

    // Add Directus Message API flow creation if enabled
    if (this._bootstrapConfig.fileAccess.directus?.generateFlows) {
      const directusUtil = ConfigStoreFactory.getInstance() as DirectusUtil;
      this._server.addHook('onRoute', (routeOptions: RouteOptions) => {
        directusUtil!
          .addDirectusMessageApiFlowsFastifyRouteHook(routeOptions, this._server.getSchemas())
          .then()
          .catch((error) => {
            this._logger.error('Could not add Directus Message API flow', { error });
          });
      });

      this._server.addHook('onReady', async () => {
        this._logger.info('Directus actions initialization finished');
      });
    }

    // Register API authentication
    this.registerApiAuth();

    // Initialize File Access Implementation
    this._fileStorage = ConfigStoreFactory.getInstance();

    // Register AJV for schema validation
    this.registerAjv();

    // Initialize repository store
    this.initRepositoryStore();
    this.initIdGenerator();
    this.initCertificateAuthorityService();
    this.initSmartChargingService();
    this.initRealTimeAuthorizer();
  }

  async initialize(): Promise<void> {
    // Initialize module & API
    // Always initialize API after SwaggerUI
    await this.initSystem();

    // Initialize database
    await this.initDb();

    // Set up shutdown handlers
    for (const event of ['SIGINT', 'SIGTERM', 'SIGQUIT']) {
      process.on(event, async () => {
        await this.shutdown();
      });
    }
  }

  async shutdown() {
    // todo shut down depending on setup
    // Shut down all modules and central system
    for (const module of this.modules) {
      await module.shutdown();
    }
    await this._networkConnection?.shutdown();

    // Shutdown server
    await this._server.close();

    setTimeout(() => {
      console.log('Exiting...');
      process.exit(1);
    }, 2000);
  }

  async run(): Promise<void> {
    try {
      await this.initialize();
      await this._syncWebsocketConfig();
      await this._server
        .listen({
          host: this.host,
          port: this.port,
        })
        .then((address) => {
          this._logger?.info(`Server listening at ${address}, cicd test again`);
        })
        .catch((error) => {
          this._logger?.error(error);
          process.exit(1);
        });
      // TODO Push config to microservices
    } catch (error) {
      await Promise.reject(error);
    }
  }

  protected async _syncWebsocketConfig() {
    for (const websocketServerConfig of this._systemConfig.util.networkConnection
      .websocketServers) {
      const [serverNetworkProfile] = await ServerNetworkProfile.findOrBuild({
        where: {
          id: websocketServerConfig.id,
        },
      });
      serverNetworkProfile.tenantId = websocketServerConfig.tenantId;
      serverNetworkProfile.host = websocketServerConfig.host;
      serverNetworkProfile.port = websocketServerConfig.port;
      serverNetworkProfile.pingInterval = websocketServerConfig.pingInterval;
      serverNetworkProfile.protocol = websocketServerConfig.protocol;
      serverNetworkProfile.messageTimeout = this._systemConfig.maxCallLengthSeconds;
      serverNetworkProfile.securityProfile = websocketServerConfig.securityProfile;
      serverNetworkProfile.allowUnknownChargingStations =
        websocketServerConfig.allowUnknownChargingStations;
      serverNetworkProfile.tlsKeyFilePath = websocketServerConfig.tlsKeyFilePath;
      serverNetworkProfile.tlsCertificateChainFilePath =
        websocketServerConfig.tlsCertificateChainFilePath;
      serverNetworkProfile.mtlsCertificateAuthorityKeyFilePath =
        websocketServerConfig.mtlsCertificateAuthorityKeyFilePath;
      serverNetworkProfile.rootCACertificateFilePath =
        websocketServerConfig.rootCACertificateFilePath;

      await serverNetworkProfile.save();
    }
  }

  protected _createSender(): IMessageSender {
    return new RabbitMqSender(
      this._systemConfig,
      this._logger,
      undefined,
      this._bootstrapConfig.amqp,
    );
  }

  protected _createHandler(): IMessageHandler {
    return new RabbitMqReceiver(
      this._systemConfig,
      this._logger,
      undefined,
      undefined,
      undefined,
      this._bootstrapConfig.amqp,
    );
  }

  private initHealthCheck() {
    const healthResponseSchema = {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['healthy', 'unhealthy'] },
        database: { type: 'string', enum: ['connected', 'disconnected', 'unknown'] },
        rabbitmq: {
          type: 'string',
          enum: ['connected', 'disconnected', 'not_configured', 'unknown'],
        },
        s3: {
          type: 'string',
          enum: ['connected', 'disconnected', 'not_configured', 'unknown'],
        },
        hasura: {
          type: 'string',
          enum: ['connected', 'disconnected', 'not_configured', 'unknown'],
        },
        walletIntegration: {
          type: 'string',
          enum: ['enabled', 'disabled'],
        },
        paymentQueue: {
          type: 'string',
          enum: ['connected', 'disconnected', 'not_configured', 'unknown'],
        },
        midlayerApi: {
          type: 'string',
          enum: ['connected', 'disconnected', 'not_configured', 'unknown'],
        },
        errors: { type: 'array', items: { type: 'string' } },
      },
      required: [
        'status',
        'database',
        'rabbitmq',
        's3',
        'hasura',
        'walletIntegration',
        'paymentQueue',
        'midlayerApi',
      ],
    };

    const bootstrapConfig = this._bootstrapConfig;

    // Use fastify.register() for proper Swagger integration
    this._server.register(async (fastify) => {
      fastify.get(
        '/health',
        {
          schema: {
            description:
              'Health check endpoint for infrastructure monitoring (Database + RabbitMQ + S3 + Hasura + Midlayer RabbitMQ + Midlayer API)',
            tags: ['System'],
            response: {
              200: {
                description: 'All services are healthy',
                ...healthResponseSchema,
              },
              503: {
                description: 'One or more services are unhealthy',
                ...healthResponseSchema,
              },
            },
          },
        },
        async (_request, reply) => {
          const walletEnabled = bootstrapConfig.yatriEnergy.enabled;
          const healthStatus: {
            status: string;
            database: string;
            rabbitmq: string;
            s3: string;
            hasura: string;
            walletIntegration: string;
            paymentQueue: string;
            midlayerApi: string;
            errors?: string[];
          } = {
            status: 'healthy',
            database: 'unknown',
            rabbitmq: 'unknown',
            s3: 'unknown',
            hasura: 'unknown',
            walletIntegration: walletEnabled ? 'enabled' : 'disabled',
            paymentQueue: 'unknown',
            midlayerApi: 'unknown',
          };
          const errors: string[] = [];

          // Check database connection
          try {
            await sequelize.DefaultSequelizeInstance.getInstance(bootstrapConfig).authenticate();
            healthStatus.database = 'connected';
          } catch (error) {
            healthStatus.database = 'disconnected';
            errors.push('Database connection failed');
          }

          // Check RabbitMQ connection
          try {
            const amqpUrl = bootstrapConfig.amqp.url;
            if (amqpUrl) {
              const connection = await amqplib.connect(amqpUrl);
              await connection.close();
              healthStatus.rabbitmq = 'connected';
            } else {
              healthStatus.rabbitmq = 'not_configured';
            }
          } catch (error) {
            healthStatus.rabbitmq = 'disconnected';
            errors.push('RabbitMQ connection failed');
          }

          // Check S3 connection (bucket exists + config file exists)
          try {
            const s3Config = bootstrapConfig.fileAccess.s3;
            if (bootstrapConfig.fileAccess.type === 's3' && s3Config) {
              const s3Client = new S3Client({
                ...(s3Config.endpoint ? { endpoint: s3Config.endpoint } : {}),
                ...(s3Config.region ? { region: s3Config.region } : {}),
                forcePathStyle: !!s3Config.s3ForcePathStyle,
                ...(s3Config.accessKeyId && s3Config.secretAccessKey
                  ? {
                      credentials: {
                        accessKeyId: s3Config.accessKeyId,
                        secretAccessKey: s3Config.secretAccessKey,
                      },
                    }
                  : {}),
              });

              const bucketName = bootstrapConfig.configDir || s3Config.defaultBucketName;
              const configFileName = bootstrapConfig.configFileName || 'config.json';

              // Check bucket exists
              await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));

              // Check config file exists
              await s3Client.send(
                new HeadObjectCommand({ Bucket: bucketName, Key: configFileName }),
              );

              healthStatus.s3 = 'connected';
            } else {
              healthStatus.s3 = 'not_configured';
            }
          } catch (error) {
            healthStatus.s3 = 'disconnected';
            errors.push('S3 connection failed');
          }

          // Check Hasura GraphQL Engine connection
          // NOTE: Hasura check is NON-CRITICAL because Hasura depends on citrine being healthy first.
          // Making this critical would create a circular dependency deadlock during startup.
          try {
            const hasuraUrl =
              bootstrapConfig.hasuraHealthUrl || 'http://graphql-engine:8080/healthz';
            if (hasuraUrl) {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 5000);
              const response = await fetch(hasuraUrl, { signal: controller.signal });
              clearTimeout(timeoutId);
              if (response.ok) {
                healthStatus.hasura = 'connected';
              } else {
                healthStatus.hasura = 'disconnected';
                // Non-critical: don't add to errors
              }
            } else {
              healthStatus.hasura = 'not_configured';
            }
          } catch (error) {
            healthStatus.hasura = 'disconnected';
            // Non-critical: don't add to errors (Hasura starts after citrine)
          }

          // Check midlayer RabbitMQ connection (for async payment processing)
          // If wallet integration is enabled, midlayer RabbitMQ MUST be configured and connected
          try {
            const midlayerRabbitMqUrl = bootstrapConfig.yatriEnergy.rabbitmqUrl;

            if (midlayerRabbitMqUrl) {
              const connection = await amqplib.connect(midlayerRabbitMqUrl);
              await connection.close();
              healthStatus.paymentQueue = 'connected';
            } else if (walletEnabled) {
              // Wallet integration is enabled but midlayer RabbitMQ is not configured - this is an error
              healthStatus.paymentQueue = 'not_configured';
              errors.push('Midlayer RabbitMQ not configured but wallet integration is enabled');
            } else {
              // Wallet integration is disabled, payment queue not needed
              healthStatus.paymentQueue = 'not_configured';
            }
          } catch (error) {
            healthStatus.paymentQueue = 'disconnected';
            errors.push('Midlayer RabbitMQ connection failed');
          }

          // Check midlayer API reachability (yatri-energy-backend /health)
          // Only checked if wallet integration is enabled
          try {
            const midlayerBaseUrl = bootstrapConfig.yatriEnergy.baseUrl;

            if (midlayerBaseUrl && walletEnabled) {
              const healthUrl = midlayerBaseUrl.replace(/\/+$/, '') + '/health';
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 5000);
              const response = await fetch(healthUrl, { signal: controller.signal });
              clearTimeout(timeoutId);
              if (response.ok) {
                healthStatus.midlayerApi = 'connected';
              } else {
                healthStatus.midlayerApi = 'disconnected';
                errors.push(`Midlayer API health check failed (HTTP ${response.status})`);
              }
            } else if (walletEnabled) {
              // Wallet integration is enabled but midlayer base URL is not configured
              healthStatus.midlayerApi = 'not_configured';
              errors.push('Midlayer API base URL not configured but wallet integration is enabled');
            } else {
              // Wallet integration is disabled, midlayer API check not needed
              healthStatus.midlayerApi = 'not_configured';
            }
          } catch (error) {
            healthStatus.midlayerApi = 'disconnected';
            errors.push('Midlayer API health check failed');
          }

          // Determine overall health status
          if (errors.length > 0) {
            healthStatus.status = 'unhealthy';
            healthStatus.errors = errors;
            return reply.status(503).send(healthStatus);
          }

          return healthStatus;
        },
      );
    });
  }

  private initAjv(ajv?: Ajv) {
    return (
      ajv ||
      new Ajv({
        removeAdditional: 'all',
        useDefaults: true,
        coerceTypes: 'array',
        strict: false,
      })
    );
  }

  private addAjvFormats() {
    addFormats(this._ajv, {
      mode: 'fast',
      formats: ['date-time'],
    });
  }

  private initLogger() {
    const isCloud = this._bootstrapConfig.deploymentTarget === 'cloud';

    const loggerSettings = {
      name: 'CitrineOS Logger',
      minLevel: this._systemConfig.logLevel,
      hideLogPositionForProduction: this._systemConfig.env === 'production',
      type: isCloud ? ('json' as const) : ('pretty' as const),
    };

    return new Logger<ILogObj>(loggerSettings);
  }

  private async initDb() {
    await sequelize.DefaultSequelizeInstance.initializeSequelize();
  }

  private initCache(cache?: ICache): ICache {
    return (
      cache ||
      (this._systemConfig.util.cache.redis
        ? new RedisCache({
            socket: {
              host: this._systemConfig.util.cache.redis.host,
              port: this._systemConfig.util.cache.redis.port,
            },
          })
        : new MemoryCache())
    );
  }

  private async initSwagger() {
    if (this._systemConfig.util.swagger) {
      await initSwagger(this._systemConfig, this._server);
    }
  }

  private registerAjv() {
    // todo type schema instead of any
    const fastifySchemaCompiler: FastifySchemaCompiler<any> = (
      routeSchema: FastifyRouteSchemaDef<any>,
    ) => this._ajv?.compile(routeSchema.schema) as FastifyValidationResult;
    this._server.setValidatorCompiler(fastifySchemaCompiler);
  }

  private registerApiAuth() {
    const authProvider = this.initApiAuthProvider();
    this._server.register(ApiAuthPlugin, {
      provider: authProvider,
      options: {
        excludedRoutes: [
          '/health', // Health check endpoint
          '/docs', // API documentation
        ],
        debug: this._systemConfig.logLevel <= 2, // Enable debug logs in dev mode
      },
      logger: this._logger,
    });
  }

  private initNetworkConnection() {
    this._authenticator = new Authenticator(
      new UnknownStationFilter(
        new sequelize.SequelizeLocationRepository(this._bootstrapConfig, this._logger),
        this._logger,
      ),
      new ConnectedStationFilter(this._cache, this._logger),
      new NetworkProfileFilter(
        new sequelize.SequelizeDeviceModelRepository(this._bootstrapConfig, this._logger),
        this._logger,
      ),
      new BasicAuthenticationFilter(
        new sequelize.SequelizeDeviceModelRepository(this._bootstrapConfig, this._logger),
        this._logger,
      ),
      this._logger,
    );

    const webhookDispatcher = new WebhookDispatcher(
      this._repositoryStore.subscriptionRepository,
      this._logger,
    );

    const router = new MessageRouterImpl(
      this._systemConfig,
      this._cache,
      this._createSender(),
      this._createHandler(),
      webhookDispatcher,
      async (_identifier: string, _message: string) => {},
      this._logger,
      this._ajv,
      this._repositoryStore.locationRepository,
      this._repositoryStore.subscriptionRepository,
    );

    this._networkConnection = new WebsocketNetworkConnection(
      this._systemConfig,
      this._cache,
      this._authenticator,
      router,
      this._logger,
    );

    this.apis.push(new AdminApi(router, this._server, this._logger));

    this.host = this._systemConfig.centralSystem.host;
    this.port = this._systemConfig.centralSystem.port;
  }

  private async initHandlersAndAddModule(module: AbstractModule) {
    await module.initHandlers();
    this.modules.push(module);
  }

  private async initAllModules() {
    if (this._systemConfig.modules.certificates) {
      await this.initCertificatesModule();
    }

    if (this._systemConfig.modules.configuration) {
      await this.initConfigurationModule();
    }

    if (this._systemConfig.modules.evdriver) {
      await this.initEVDriverModule();
    }

    if (this._systemConfig.modules.monitoring) {
      await this.initMonitoringModule();
    }

    if (this._systemConfig.modules.reporting) {
      await this.initReportingModule();
    }

    if (this._systemConfig.modules.smartcharging) {
      await this.initSmartChargingModule();
    }

    if (this._systemConfig.modules.transactions) {
      await this.initTransactionsModule();
    }

    // TODO: take actions to make sure module has correct subscriptions and log proof
    if (this.eventGroup !== EventGroup.All) {
      this.host = this._systemConfig.centralSystem.host as string;
      this.port = this._systemConfig.centralSystem.port as number;
    }
  }

  private initApiAuthProvider(): IApiAuthProvider {
    this._logger.info(
      'Initializing API authentication provider,',
      this._systemConfig.util.authProvider,
    );
    if (this._systemConfig.util.authProvider.oidc) {
      return new OIDCAuthProvider(this._systemConfig.util.authProvider.oidc, this._logger);
    } else if (this._systemConfig.util.authProvider.apiKey) {
      const apiKey = this._bootstrapConfig.apiKey;
      if (!apiKey) {
        throw new Error(
          'CITRINEOS_API_KEY environment variable is required when apiKey auth is enabled',
        );
      }
      return new ApiKeyAuthProvider(apiKey, this._logger);
    } else if (this._systemConfig.util.authProvider.localByPass) {
      return new LocalBypassAuthProvider(this._logger);
    } else {
      throw new Error('No valid API authentication provider configured');
    }
  }

  private async initCertificatesModule() {
    const module = new CertificatesModule(
      this._systemConfig,
      this._cache,
      this._createSender(),
      this._createHandler(),
      this._logger,
      this._repositoryStore.deviceModelRepository,
      this._repositoryStore.certificateRepository,
      this._repositoryStore.locationRepository,
    );
    await this.initHandlersAndAddModule(module);
    this.apis.push(
      new CertificatesOcpp201Api(module, this._server, this._logger),
      new CertificatesDataApi(
        module,
        this._server,
        this._fileStorage,
        this._networkConnection!,
        this._systemConfig.util.networkConnection.websocketServers,
        this._logger,
      ),
    );
  }

  private async initConfigurationModule() {
    const module = new ConfigurationModule(
      this._systemConfig,
      this._cache,
      this._createSender(),
      this._createHandler(),
      this._logger,
      this._repositoryStore.bootRepository,
      this._repositoryStore.deviceModelRepository,
      this._repositoryStore.messageInfoRepository,
      this._repositoryStore.locationRepository,
      this._repositoryStore.changeConfigurationRepository,
      this._repositoryStore.ocppMessageRepository,
      this._idGenerator,
    );
    await this.initHandlersAndAddModule(module);
    this.apis.push(
      new ConfigurationOcpp201Api(module, this._server, this._logger),
      new ConfigurationOcpp16Api(module, this._server, this._logger),
      new ConfigurationDataApi(module, this._server, this._logger),
    );
  }

  private async initEVDriverModule() {
    const module = new EVDriverModule(
      this._systemConfig,
      this._cache,
      this._createSender(),
      this._createHandler(),
      this._logger,
      this._repositoryStore.authorizationRepository,
      this._repositoryStore.localAuthListRepository,
      this._repositoryStore.deviceModelRepository,
      this._repositoryStore.tariffRepository,
      this._repositoryStore.transactionEventRepository,
      this._repositoryStore.chargingProfileRepository,
      this._repositoryStore.reservationRepository,
      this._repositoryStore.ocppMessageRepository,
      this._repositoryStore.locationRepository,
      this._certificateAuthorityService,
      this._realTimeAuthorizer,
      [],
      this._idGenerator,
      this._bootstrapConfig,
    );
    await this.initHandlersAndAddModule(module);
    this.apis.push(
      new EVDriverOcpp201Api(module, this._server, this._logger),
      new EVDriverOcpp16Api(module, this._server, this._logger),
      new EVDriverDataApi(module, this._server, this._logger),
    );
  }

  private async initMonitoringModule() {
    const module = new MonitoringModule(
      this._systemConfig,
      this._cache,
      this._createSender(),
      this._createHandler(),
      this._logger,
      this._repositoryStore.deviceModelRepository,
      this._repositoryStore.variableMonitoringRepository,
      this._idGenerator,
    );
    await this.initHandlersAndAddModule(module);
    this.apis.push(
      new MonitoringOcpp201Api(module, this._server, this._logger),
      new MonitoringDataApi(module, this._server, this._logger),
    );
  }

  private async initReportingModule() {
    const module = new ReportingModule(
      this._systemConfig,
      this._cache,
      this._createSender(),
      this._createHandler(),
      this._logger,
      this._repositoryStore.deviceModelRepository,
      this._repositoryStore.securityEventRepository,
      this._repositoryStore.variableMonitoringRepository,
    );
    await this.initHandlersAndAddModule(module);
    this.apis.push(new ReportingOcpp201Api(module, this._server, this._logger));
  }

  private async initSmartChargingModule() {
    const module = new SmartChargingModule(
      this._systemConfig,
      this._cache,
      this._createSender(),
      this._createHandler(),
      this._logger,
      this._repositoryStore.transactionEventRepository,
      this._repositoryStore.deviceModelRepository,
      this._repositoryStore.chargingProfileRepository,
      this._smartChargingService,
      this._idGenerator,
    );
    await this.initHandlersAndAddModule(module);
    this.apis.push(new SmartChargingOcpp201Api(module, this._server, this._logger));
  }

  private async initTransactionsModule() {
    const module = new TransactionsModule(
      this._systemConfig,
      this._cache,
      this._fileStorage,
      this._createSender(),
      this._createHandler(),
      this._logger,
      this._repositoryStore.transactionEventRepository,
      this._repositoryStore.authorizationRepository,
      this._repositoryStore.deviceModelRepository,
      this._repositoryStore.componentRepository,
      this._repositoryStore.locationRepository,
      this._repositoryStore.tariffRepository,
      this._repositoryStore.reservationRepository,
      this._repositoryStore.ocppMessageRepository,
      this._realTimeAuthorizer,
      undefined, // authorizers
      this._bootstrapConfig,
    );
    await this.initHandlersAndAddModule(module);
    this.apis.push(
      new TransactionsOcpp201Api(module, this._server, this._logger),
      new TransactionsDataApi(module, this._server, this._logger),
    );
    // Register payment callback webhook API for async payment processing
    registerPaymentCallbackApi(this._server, this._logger);
  }

  private async initModule(eventGroup = this.eventGroup) {
    switch (eventGroup) {
      case EventGroup.Certificates:
        await this.initCertificatesModule();
        break;
      case EventGroup.Configuration:
        await this.initConfigurationModule();
        break;
      case EventGroup.EVDriver:
        await this.initEVDriverModule();
        break;
      case EventGroup.Monitoring:
        await this.initMonitoringModule();
        break;
      case EventGroup.Reporting:
        await this.initReportingModule();
        break;
      case EventGroup.SmartCharging:
        await this.initSmartChargingModule();
        break;
      case EventGroup.Transactions:
        await this.initTransactionsModule();
        break;
      default:
        throw new Error('Unhandled module type: ' + this.appName);
    }
  }

  private async initSystem() {
    this.eventGroup = eventGroupFromString(this.appName);
    if (this.eventGroup === EventGroup.All) {
      this.initNetworkConnection();
      await this.initAllModules();
    } else if (this.eventGroup === EventGroup.General) {
      this.initNetworkConnection();
    } else {
      await this.initModule();
    }
  }

  private initRepositoryStore() {
    this._sequelizeInstance = sequelize.DefaultSequelizeInstance.getInstance(
      this._bootstrapConfig,
      this._logger,
    );
    this._repositoryStore = new RepositoryStore(
      this._bootstrapConfig,
      this._logger,
      this._sequelizeInstance,
    );
  }

  private initIdGenerator() {
    this._idGenerator = new IdGenerator(this._repositoryStore.chargingStationSequenceRepository);
  }

  private initCertificateAuthorityService() {
    this._certificateAuthorityService = new CertificateAuthorityService(
      this._systemConfig,
      this._logger,
    );
  }

  private initSmartChargingService() {
    this._smartChargingService = new InternalSmartCharging(
      this._repositoryStore.chargingProfileRepository,
    );
  }

  private initRealTimeAuthorizer() {
    this._realTimeAuthorizer = new RealTimeAuthorizer(
      this._repositoryStore.locationRepository,
      this._systemConfig,
      this._logger,
    );
  }
}

async function main() {
  const bootstrapConfig = loadBootstrapConfig();
  const config = await getSystemConfig(bootstrapConfig);
  const server = new CitrineOSServer(process.env.APP_NAME as EventGroup, bootstrapConfig, config);
  server.run().catch((error: any) => {
    console.error(error);
    process.exit(1);
  });
}

main().catch((error) => {
  console.error('Failed to initialize server:', error);
  process.exit(1);
});
