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
import { SQSClient, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';

export class CitrineOSServer {
  /**
   * Fields
   */
  private readonly _config: BootstrapConfig & SystemConfig;
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
    // TODO: Create and export config schemas for each util module, such as amqp, redis, kafka, etc, to avoid passing them possibly invalid configuration
    if (!systemConfig.util.messageBroker.amqp) {
      throw new Error('This server implementation requires amqp configuration for rabbitMQ.');
    }

    this.appName = appName;
    this._config = { ...bootstrapConfig, ...systemConfig };
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
    if (this._config.fileAccess.directus?.generateFlows) {
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
          this._logger?.info(`Server listening at ${address}, cicd test-3`);
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
    for (const websocketServerConfig of this._config.util.networkConnection.websocketServers) {
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
      serverNetworkProfile.messageTimeout = this._config.maxCallLengthSeconds;
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
    return new RabbitMqSender(this._config, this._logger);
  }

  protected _createHandler(): IMessageHandler {
    return new RabbitMqReceiver(this._config, this._logger);
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
        sqs: {
          type: 'string',
          enum: ['connected', 'disconnected', 'not_configured', 'unknown'],
        },
        errors: { type: 'array', items: { type: 'string' } },
      },
      required: ['status', 'database', 'rabbitmq', 's3', 'sqs'],
    };

    const config = this._config;

    // Use fastify.register() for proper Swagger integration
    this._server.register(async (fastify) => {
      fastify.get(
        '/health',
        {
          schema: {
            description:
              'Health check endpoint for infrastructure monitoring (Database + RabbitMQ + S3)',
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
          const healthStatus: {
            status: string;
            database: string;
            rabbitmq: string;
            s3: string;
            sqs: string;
            errors?: string[];
          } = {
            status: 'healthy',
            database: 'unknown',
            rabbitmq: 'unknown',
            s3: 'unknown',
            sqs: 'unknown',
          };
          const errors: string[] = [];

          // Check database connection
          try {
            await sequelize.DefaultSequelizeInstance.getInstance(config).authenticate();
            healthStatus.database = 'connected';
          } catch (error) {
            healthStatus.database = 'disconnected';
            errors.push('Database connection failed');
          }

          // Check RabbitMQ connection
          try {
            const amqpUrl = config.util.messageBroker.amqp?.url;
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
            const s3Config = config.fileAccess.s3;
            if (config.fileAccess.type === 's3' && s3Config) {
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

              const bucketName = config.configDir || s3Config.defaultBucketName;
              const configFileName = config.configFileName || 'config.json';

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

          // Check SQS connection (for async payment processing)
          try {
            const sqsRegion = config.yatriEnergy?.sqsRegion;
            const sqsQueueUrl = config.yatriEnergy?.sqsQueueUrl;
            if (sqsRegion && sqsQueueUrl) {
              const sqsClient = new SQSClient({ region: sqsRegion });
              await sqsClient.send(
                new GetQueueAttributesCommand({
                  QueueUrl: sqsQueueUrl,
                  AttributeNames: ['QueueArn'],
                }),
              );
              healthStatus.sqs = 'connected';
            } else {
              healthStatus.sqs = 'not_configured';
            }
          } catch (error) {
            healthStatus.sqs = 'disconnected';
            errors.push('SQS connection failed');
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
    const isCloud = process.env.DEPLOYMENT_TARGET === 'cloud';

    const loggerSettings = {
      name: 'CitrineOS Logger',
      minLevel: this._config.logLevel,
      hideLogPositionForProduction: this._config.env === 'production',
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
      (this._config.util.cache.redis
        ? new RedisCache({
            socket: {
              host: this._config.util.cache.redis.host,
              port: this._config.util.cache.redis.port,
            },
          })
        : new MemoryCache())
    );
  }

  private async initSwagger() {
    if (this._config.util.swagger) {
      await initSwagger(this._config, this._server);
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
        debug: this._config.logLevel <= 2, // Enable debug logs in dev mode
      },
      logger: this._logger,
    });
  }

  private initNetworkConnection() {
    this._authenticator = new Authenticator(
      new UnknownStationFilter(
        new sequelize.SequelizeLocationRepository(this._config, this._logger),
        this._logger,
      ),
      new ConnectedStationFilter(this._cache, this._logger),
      new NetworkProfileFilter(
        new sequelize.SequelizeDeviceModelRepository(this._config, this._logger),
        this._logger,
      ),
      new BasicAuthenticationFilter(
        new sequelize.SequelizeDeviceModelRepository(this._config, this._logger),
        this._logger,
      ),
      this._logger,
    );

    const webhookDispatcher = new WebhookDispatcher(
      this._repositoryStore.subscriptionRepository,
      this._logger,
    );

    const router = new MessageRouterImpl(
      this._config,
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
      this._config,
      this._cache,
      this._authenticator,
      router,
      this._logger,
    );

    this.apis.push(new AdminApi(router, this._server, this._logger));

    this.host = this._config.centralSystem.host;
    this.port = this._config.centralSystem.port;
  }

  private async initHandlersAndAddModule(module: AbstractModule) {
    await module.initHandlers();
    this.modules.push(module);
  }

  private async initAllModules() {
    if (this._config.modules.certificates) {
      await this.initCertificatesModule();
    }

    if (this._config.modules.configuration) {
      await this.initConfigurationModule();
    }

    if (this._config.modules.evdriver) {
      await this.initEVDriverModule();
    }

    if (this._config.modules.monitoring) {
      await this.initMonitoringModule();
    }

    if (this._config.modules.reporting) {
      await this.initReportingModule();
    }

    if (this._config.modules.smartcharging) {
      await this.initSmartChargingModule();
    }

    if (this._config.modules.transactions) {
      await this.initTransactionsModule();
    }

    // TODO: take actions to make sure module has correct subscriptions and log proof
    if (this.eventGroup !== EventGroup.All) {
      this.host = this._config.centralSystem.host as string;
      this.port = this._config.centralSystem.port as number;
    }
  }

  private initApiAuthProvider(): IApiAuthProvider {
    this._logger.info('Initializing API authentication provider,', this._config.util.authProvider);
    if (this._config.util.authProvider.oidc) {
      return new OIDCAuthProvider(this._config.util.authProvider.oidc, this._logger);
    } else if (this._config.util.authProvider.localByPass) {
      return new LocalBypassAuthProvider(this._logger);
    } else {
      throw new Error('No valid API authentication provider configured');
    }
  }

  private async initCertificatesModule() {
    const module = new CertificatesModule(
      this._config,
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
        this._config.util.networkConnection.websocketServers,
        this._logger,
      ),
    );
  }

  private async initConfigurationModule() {
    const module = new ConfigurationModule(
      this._config,
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
      this._config,
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
      this._config,
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
      this._config,
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
      this._config,
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
      this._config,
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
      this._config,
      this._logger,
    );
    this._repositoryStore = new RepositoryStore(
      this._config,
      this._logger,
      this._sequelizeInstance,
    );
  }

  private initIdGenerator() {
    this._idGenerator = new IdGenerator(this._repositoryStore.chargingStationSequenceRepository);
  }

  private initCertificateAuthorityService() {
    this._certificateAuthorityService = new CertificateAuthorityService(this._config, this._logger);
  }

  private initSmartChargingService() {
    this._smartChargingService = new InternalSmartCharging(
      this._repositoryStore.chargingProfileRepository,
    );
  }

  private initRealTimeAuthorizer() {
    this._realTimeAuthorizer = new RealTimeAuthorizer(
      this._repositoryStore.locationRepository,
      this._config,
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
