/**
 * Optional metadata to pass to the logger, can be useful for JSON loggers to
 * enable advanced filtering.
 */
export interface LogMeta {
  [key: string]: unknown;
}

/**
 * The 'level' of the log message, inspired by the 'winston' levels:
 * https://github.com/winstonjs/winston#logging-levels
 */
export const enum LogLevel {
  /**
   * Critical log message indicating something unexpected went wrong. Similar
   * in interpretation to `console.error`.
   */
  ERROR = "error",

  /**
   * Import log message warning of something potentially troublesome. Similar
   * in interpretation to `console.warn`.
   */
  WARNING = "warning",

  /**
   * General log message for information. Similar in interpretation to
   * `console.log`.
   */
  INFO = "info",

  /**
   * Particularly verbose log message, normally only needed during debugging.
   * Due to verbosity, you typically would not want this level to be output.
   * Similar in interpretation to `console.debug`.
   */
  DEBUG = "debug",
}

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
  (level: LogLevel, message: string, meta?: LogMeta): void;
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
   * Get the current scope of the logger.
   */
  public getCurrentScope() {
    return this._scope;
  }

  /**
   * Logs an `LogLevel.ERROR` message.
   */
  public error(message: string, meta?: LogMeta): void {
    return this.log(LogLevel.ERROR, message, meta);
  }

  /**
   * Logs an `LogLevel.WARN` message.
   */
  public warn(message: string, meta?: LogMeta): void {
    return this.log(LogLevel.WARNING, message, meta);
  }

  /**
   * Logs an `LogLevel.INFO` message.
   */
  public info(message: string, meta?: LogMeta): void {
    return this.log(LogLevel.INFO, message, meta);
  }

  /**
   * Logs an `LogLevel.DEBUG` message.
   */
  public debug(message: string, meta?: LogMeta): void {
    return this.log(LogLevel.DEBUG, message, meta);
  }
}

/**
 * If you don't like the simple format of our default console logging, you can
 * pass this custom config to `makeConsoleLogFactory` to log in a different
 * format - perhaps log your scope information more clearly, or add a touch of
 * colour.
 */
export interface ConsoleLogConfig<TLogScope> {
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
  ): Array<unknown>;
}

/**
 * Lets you build a console log factory with custom log formatter. Only logs
 * `DEBUG` level messages if the `GRAPHILE_LOGGER_DEBUG` environmental variable
 * is set.
 */
export function makeConsoleLogFactory<TLogScope extends {}>(
  { format, formatParameters }: ConsoleLogConfig<TLogScope> = {
    format: "%s: %s (%O)",
    formatParameters(level, message, scope) {
      return [level.toUpperCase(), message, scope];
    },
  },
) {
  return function consoleLogFactory(scope: Partial<TLogScope>) {
    return (level: LogLevel, message: string) => {
      if (level === LogLevel.DEBUG && !process.env.GRAPHILE_LOGGER_DEBUG) {
        return;
      }

      const method = (() => {
        switch (level) {
          case LogLevel.ERROR:
            return "error" as const;
          case LogLevel.WARNING:
            return "warn" as const;
          case LogLevel.INFO:
            return "info" as const;
          default:
            // `console.debug` in Node is just an alias for `console.log` anyway.
            return "log" as const;
        }
      })();

      console[method](format, ...formatParameters(level, message, scope));
    };
  };
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
