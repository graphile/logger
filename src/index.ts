/**
 * Optional metadata to pass to the logger, can be useful for JSON loggers to
 * enable advanced filtering.
 */
export interface LogMeta {
  [key: string]: unknown;
}

const EMPTY_OBJECT = Object.freeze({});

/**
 * The 'level' of the log message, inspired by the 'winston' levels:
 * https://github.com/winstonjs/winston#logging-levels
 */
export type LogLevel = "error" | "warning" | "info" | "debug";

/** @deprecated Just use string values: "error" | "warning" | "info" | "debug". */
export const LogLevel = Object.freeze({
  /**
   * Critical log message indicating something unexpected went wrong. Similar
   * in interpretation to `console.error`.
   */
  ERROR: "error",

  /**
   * Import log message warning of something potentially troublesome. Similar
   * in interpretation to `console.warn`.
   */
  WARNING: "warning",

  /**
   * General log message for information. Similar in interpretation to
   * `console.log`.
   */
  INFO: "info",

  /**
   * Particularly verbose log message, normally only needed during debugging.
   * Due to verbosity, you typically would not want this level to be output.
   * Similar in interpretation to `console.debug`.
   */
  DEBUG: "debug",
} as const);

/**
 * The `LogFunctionFactory` is a user-provided function that receives a scope
 * and returns a `LogFunction` that is responsible for processing log messages.
 */
export interface LogFunctionFactory<TLogScope extends {}> {
  (scope: Partial<TLogScope>): LogFunction;
}

/**
 * The `LogFunction` is the function returned from a user's
 * `LogFunctionFactory`, it is called for each log message and is passed the
 * log level, the message to log, and any additional metadata. Since it is
 * generated from `LogFunctionFactory`, it also implicitly has access to the
 * scope.
 */
export interface LogFunction {
  (level: LogLevel, message: string, meta: LogMeta): void;
}

/**
 * A `Logger` is initialized with a `LogFunctionFactory` and an initial scope.
 * It has convenience methods for logging different levels (error, warn, info,
 * debug) which pass through to the underlying `LogFunction`. It also allows a
 * narrower scoped logger to be generated via the `scope` method.
 */
export class Logger<TLogScope extends {} = {}> {
  private _scope: Partial<TLogScope>;
  private _logFactory: LogFunctionFactory<TLogScope>;

  private log: LogFunction;

  public constructor(
    logFactory: LogFunctionFactory<TLogScope>,
    scope: Partial<TLogScope> = {},
  ) {
    this._scope = scope;
    this._logFactory = logFactory;

    this.log = logFactory(scope);
  }

  /**
   * Creates a more narrowly scoped logger; this is useful when your code
   * performs a subtask. For example: an HTTP server might have a global
   * logger, and it might create scoped loggers for each incoming HTTP request.
   * When the HTTP requests goes through a particular middleware it might use
   * an even more narrowly scoped logger still.
   */
  public scope<TNewLogScope extends {}>(
    additionalScope: Partial<TNewLogScope>,
  ) {
    return new Logger<TLogScope & TNewLogScope>(this._logFactory, {
      ...this._scope,
      ...additionalScope,
    } as Partial<TLogScope & TNewLogScope>);
  }

  /**
   * Logs an `"error"` message.
   */
  public error(message: string, meta?: LogMeta): void {
    return this.log("error", message, meta ?? EMPTY_OBJECT);
  }

  /**
   * Logs an `"warning"` message.
   */
  public warn(message: string, meta?: LogMeta): void {
    return this.log("warning", message, meta ?? EMPTY_OBJECT);
  }

  /**
   * Logs an `"info"` message.
   */
  public info(message: string, meta?: LogMeta): void {
    return this.log("info", message, meta ?? EMPTY_OBJECT);
  }

  /**
   * Logs an `"debug"` message.
   */
  public debug(message: string, meta?: LogMeta): void {
    return this.log("debug", message, meta ?? EMPTY_OBJECT);
  }
}

/**
 * If you don't like the simple format of our default console logging, you can
 * pass this custom config to `makeConsoleLogFactory` to log in a different
 * format - perhaps log your scope information more clearly, or add a touch of
 * colour.
 *
 * This variant is optimized for fixed format strings.
 */
export interface ConsoleLogConfigObject<TLogScope> {
  /**
   * Format string passed to the relevant console method; these format strings
   * are processed via `util.format`:
   * https://nodejs.org/api/util.html#util_util_format_format_args
   *
   * Useful format strings:
   *
   * `%s` - string
   * `%i` - int
   * `%f` - float
   * `%j` - JSON (prevents circular)
   * `%o` - object (like `util.inspect`, but shows hidden properties/proxies)
   * `%O` - object (like vanilla `util.inspect`)
   * `%%` - the '%' character
   */
  format: string;

  /**
   * A function that returns the list of parameters to feed into the format
   * string.
   */
  formatParameters(
    level: LogLevel,
    message: string,
    scope: Partial<TLogScope>,
    meta: LogMeta,
  ): ReadonlyArray<unknown>;
}

/**
 * If you don't like the simple format of our default console logging, you can
 * pass this custom config to `makeConsoleLogFactory` to log in a different
 * format - perhaps log your scope information more clearly, or add a touch of
 * colour.
 *
 * This variant allows for dynamic format strings.
 */
export type ConsoleLogConfigCallback<TLogScope> = (
  level: LogLevel,
  message: string,
  scope: Partial<TLogScope>,
  meta: LogMeta,
) => {
  /**
   * Format string passed to the relevant console method; these format strings
   * are processed via `util.format`:
   * https://nodejs.org/api/util.html#util_util_format_format_args
   *
   * Useful format strings:
   *
   * `%s` - string
   * `%i` - int
   * `%f` - float
   * `%j` - JSON (prevents circular)
   * `%o` - object (like `util.inspect`, but shows hidden properties/proxies)
   * `%O` - object (like vanilla `util.inspect`)
   * `%%` - the '%' character
   */
  format: string;

  /** The list of parameters to feed into the format string. */
  formatParameters: ReadonlyArray<unknown>;
};

export type ConsoleLogConfig<TLogScope> =
  | ConsoleLogConfigObject<TLogScope>
  | ConsoleLogConfigCallback<TLogScope>;

// Reading envvars is expensive; cache it.
const omitDebugLogs = !process.env.GRAPHILE_LOGGER_DEBUG;

const DEFAULT_CONFIG: ConsoleLogConfig<any> = (level, message, scope, meta) => {
  const scopeString = Object.entries(scope)
    .map(([key, val]) => `${key}:${JSON.stringify(val)}`)
    .join(",");

  let format = "%s%s: %s";
  const formatParameters: unknown[] = [
    level.toUpperCase(),
    scopeString ? `[${scopeString}]` : "",
    message,
  ];

  if (Object.keys(meta).length > 0) {
    format += " (%O)";
    formatParameters.push(meta);
  }

  return { format, formatParameters };
};

/**
 * Lets you build a console log factory with custom log formatter. Only logs
 * `DEBUG` level messages if the `GRAPHILE_LOGGER_DEBUG` environmental variable
 * is set.
 */
export function makeConsoleLogFactory<TLogScope extends {}>(
  config: ConsoleLogConfig<TLogScope> = DEFAULT_CONFIG,
): LogFunctionFactory<TLogScope> {
  return function consoleLogFactory(scope) {
    if (typeof config === "function") {
      return function dynamicFormatLog(level, message, meta) {
        if (omitDebugLogs && level === "debug") {
          return;
        }
        const { format, formatParameters } = config(
          level,
          message,
          scope,
          meta,
        );
        return doConsoleLog(level, format, formatParameters);
      };
    } else {
      const { format, formatParameters } = config;
      return function fixedFormatLog(level, message, meta) {
        if (omitDebugLogs && level === "debug") {
          return;
        }
        const params = formatParameters(level, message, scope, meta);
        return doConsoleLog(level, format, params);
      };
    }
  };
}

/** @internal */
function doConsoleLog(
  level: LogLevel,
  format: string,
  formatParameters: readonly unknown[],
): void {
  const method =
    level === "error" || level === "info"
      ? level
      : level === "warning"
      ? "warn"
      : // `console.debug` in Node is just an alias for `console.log` anyway.
        "log";

  console[method](format, ...formatParameters);
}

/**
 * Our built in `LogFunctionFactory` which uses `console` for logging, and only
 * logs `DEBUG` level messages if the `GRAPHILE_LOGGER_DEBUG` environmental
 * variable is set. Library authors can use this as a fallback if users don't
 * provide their own logger. If you want to format your logs in a particular
 * way, use `makeConsoleLogFactory` instead.
 */
export const consoleLogFactory = makeConsoleLogFactory();

/**
 * A logger that can be used immediately.
 */
export const defaultLogger = new Logger(consoleLogFactory, {});
