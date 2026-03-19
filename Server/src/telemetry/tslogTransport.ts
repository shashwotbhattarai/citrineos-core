// SPDX-FileCopyrightText: 2025 Yatri Motorcycles, Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

// Bridges tslog logs to OpenTelemetry Logs API for export to Grafana/Loki.

import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { trace, context } from '@opentelemetry/api';
import { type ILogObj } from 'tslog';

interface ILogObjMeta {
  _meta: {
    name?: string;
    date: Date;
    logLevelId: number;
    logLevelName: string;
    path?: {
      filePath?: string;
      fileLine?: string;
      fileColumn?: string;
    };
  };
}

const severityMap: Record<number, SeverityNumber> = {
  0: SeverityNumber.TRACE, // silly
  1: SeverityNumber.TRACE2, // trace
  2: SeverityNumber.DEBUG, // debug
  3: SeverityNumber.INFO, // info
  4: SeverityNumber.WARN, // warn
  5: SeverityNumber.ERROR, // error
  6: SeverityNumber.FATAL, // fatal
};

export function createTslogOtelTransport(): (logObj: ILogObj) => void {
  const otelLogger = logs.getLoggerProvider().getLogger('citrineos-tslog');

  return (logObj: ILogObj) => {
    const meta = (logObj as unknown as ILogObjMeta)._meta;
    if (!meta) return;

    // Extract the log message body (all properties except _meta)
    const { _meta, ...body } = logObj as any;

    // Build a readable message from the log arguments
    const messageArgs = Object.values(body);
    const message = messageArgs
      .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
      .join(' ');

    // Get current trace context for log-trace correlation
    const activeSpan = trace.getSpan(context.active());
    const spanContext = activeSpan?.spanContext();

    const attributes: Record<string, string> = {
      'logger.name': meta.name ?? 'CitrineOS',
      'log.level': meta.logLevelName,
    };

    if (meta.path?.filePath) {
      attributes['code.filepath'] = meta.path.filePath;
    }
    if (meta.path?.fileLine) {
      attributes['code.lineno'] = meta.path.fileLine;
    }

    otelLogger.emit({
      severityNumber: severityMap[meta.logLevelId] ?? SeverityNumber.INFO,
      severityText: meta.logLevelName,
      body: message,
      timestamp: meta.date,
      attributes,
      context: spanContext ? trace.setSpan(context.active(), activeSpan!) : undefined,
    });
  };
}
