// SPDX-FileCopyrightText: 2025 Yatri Motorcycles, Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

// OpenTelemetry SDK bootstrap — loaded via `node -r` BEFORE application code.
// This ensures auto-instrumentation hooks http/net before Fastify imports them.

const otelEndpoint = process.env.OTEL_ENDPOINT;
const otelServiceName = process.env.OTEL_SERVICE_NAME;

const missing = [!otelEndpoint && 'OTEL_ENDPOINT', !otelServiceName && 'OTEL_SERVICE_NAME'].filter(
  Boolean,
);

if (missing.length > 0) {
  console.error(
    `[OTel] FATAL: Missing required environment variable(s): ${missing.join(', ')}. Exiting.`,
  );
  process.exit(1);
}

{
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
  const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
  const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
  const { resourceFromAttributes } = require('@opentelemetry/resources');
  const { SimpleLogRecordProcessor } = require('@opentelemetry/sdk-logs');
  const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const {
    ATTR_SERVICE_NAME,
    ATTR_SERVICE_VERSION,
  } = require('@opentelemetry/semantic-conventions');
  const os = require('os');

  const environment = process.env.NODE_ENV ?? 'development';

  const tlsOptions = {
    rejectUnauthorized: false,
  };

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: otelServiceName,
    [ATTR_SERVICE_VERSION]: process.env.SERVICE_VERSION ?? '1.8.0',
    'service.instance.id': os.hostname(),
    'service.namespace': `energy-${environment}`,
    'deployment.environment': environment,
  });

  const traceExporter = new OTLPTraceExporter({
    url: `${otelEndpoint}/v1/traces`,
    headers: {},
    httpAgentOptions: tlsOptions,
  });

  const metricExporter = new OTLPMetricExporter({
    url: `${otelEndpoint}/v1/metrics`,
    headers: {},
    httpAgentOptions: tlsOptions,
  });

  const logExporter = new OTLPLogExporter({
    url: `${otelEndpoint}/v1/logs`,
    headers: {},
    httpAgentOptions: tlsOptions,
  });

  const sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 5000,
    }),
    logRecordProcessor: new SimpleLogRecordProcessor(logExporter),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          enabled: true,
          ignoreIncomingRequestHook: (req: { url?: string }) => {
            return !!(req.url && (req.url.includes('/health') || req.url.includes('/docs')));
          },
        },
        '@opentelemetry/instrumentation-fastify': { enabled: true },
        '@opentelemetry/instrumentation-pg': { enabled: true },
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
      }),
    ],
  });

  sdk.start();
  console.log(`[OTel] OpenTelemetry SDK started — exporting to ${otelEndpoint}`);

  const shutdown = async () => {
    try {
      await sdk.shutdown();
      console.log('[OTel] OpenTelemetry SDK shut down successfully');
    } catch (err) {
      console.error('[OTel] Error shutting down OpenTelemetry SDK', err);
    }
  };

  process.on('SIGTERM', async () => {
    await shutdown();
  });

  process.on('SIGINT', async () => {
    await shutdown();
  });
}
