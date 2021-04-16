# @graphile/logger

There's a lot of logging frameworks out there; if we picked one then it'd be the
wrong one for many users. Just using `console.log` isn't optimal for people who
want a consistent logging solution.

`@graphile/logger` acts as an extremely lightweight zero-dependency
TypeScript-native abstraction; it allows our libraries to get on with the job of
logging whilst allowing library users to override how/where the logs are output.

Originally we
[built this for Graphile Worker](https://github.com/graphile/worker/blob/main/src/logger.ts),
but as desire for similar facilities in our other projects grew we decided to
roll it out into its own project.

## Status

Feature complete. Ignoring comments, once compiled it's only about 60 lines of
code!

(This is a Node library, it's not intended to be used in the browser.)

## Installation

Install via `yarn add @graphile/logger` or `npm install @graphile/logger`.

## Usage for library consumers

This section is for users of a library that users `@graphile/logger` who want to
know how to hook up their preferred logging software instead of using the
`console` fallback. If you're a library author and you want to use
`@graphile/logger` in your project, please instead see
[Usage for library authors](#usage-for-library-authors) below.

### Creating a custom Logger

To create a custom logger you first need to create a _log function factory_ -
that is to say a function which returns a _log function_. Here's a trivially
simple _log function factory_ which logs to `console`:

```js
function logFunctionFactory(scope) {
  return function logFunction(level, message, meta) {
    console.log(`${level}: ${message});
  }
}
```

Your _log function factory_ should conform to the `LogFunctionFactory` interface
defined in the source code.

Once you have your _log function factory_ you can create a logger from it:

```ts
import { Logger } from "@graphile/logger";

const logger = new Logger(logFunctionFactory);
```

Now you can pass your custom `logger` to the library you're using.

### Bunyan example

Here's an example of logging with
[bunyan](https://github.com/trentm/node-bunyan):

```ts
import { Logger, LogLevel } from "@graphile/logger";
import bunyan from "bunyan";

const bunyanLog = bunyan.createLogger({ name: "myapp" });

const logger = new Logger((scope) => {
  const scopedBunyanLog = bunyanLog.child(scope);
  return (level, message, meta) => {
    switch (level) {
      case LogLevel.ERROR:
        return scopedBunyanLog.error(`%s`, message, meta);
      case LogLevel.WARNING:
        return scopedBunyanLog.warn(`%s`, message, meta);
      case LogLevel.DEBUG:
        return scopedBunyanLog.debug(`%s`, message, meta);
      case LogLevel.INFO:
      default:
        return scopedBunyanLog.info(`%s`, message, meta);
    }
  };
});

logger.info("Hello with Bunyan", { randomNumber: { fairDiceRoll: 4 } });
```

## Usage for library authors

This section is for library authors who want to use `@graphile/logger` in their
library. If you're a user of a library that users `@graphile/logger` and you
want to know how to hook up your preferred logging software, please see
[Usage for library consumers](#usage-for-library-consumers) above.

### Logger

When you're logging in your library code, you'll be dealing with a `Logger`
instance (for creating your own `Logger` instance, see
[Usage for library consumers](#usage-for-library-consumers) above). `Logger` has
5 methods you'll care about.

The first for methods ─ `error`, `warn`, `info` and `debug` ─ are your four
logging methods. They all accept a message string and an optional meta object.
It's often useful to put additional information into the meta object so that
people who are doing structured (i.e. JSON) logging can filter on these special
properties. We strongly recommend you only put JSON-able values into the meta,
and be careful with personally identifiable information (PII) just as you would
with the log message itself.

```ts
logger.info("Hello world!");
logger.error("++?????++ Out of Cheese Error. Redo From Start.");
logger.debug("The answer to the big question... 42", { meaningOfLife: 42 });
```

The fifth method, `scope`, returns a new `Logger` instance with a modified
(generally narrower) scope.

```ts
const newLogger = logger.scope({ id: request.id });
```

You can use the scope to give more "ambient" information to your users, telling
them about the context in which the logger is running - e.g. what's the task or
request identifier that's being dealt with.

### `defaultLogger`

Great as a fallback when the user opts to not pass their own custom logger, this
requires no setup and just logs to `console`; you should use this as the
fallback if you don't have specific logging requirements.

Example:

```ts
import { defaultLogger } from "@graphile/logger";

function myAwesomeLibraryMethod(logger = defaultLogger) {
  logger.info("Hi");
  logger.info("Hi with meta", { meta: true, meaning: 42 });
}

myAwesomeLibraryMethod();
```

### `makeCustomLogFactory`

If you want your logs to be a little more custom, or there's particular
information you want them to include from the scope, then a logger based on a
custom log factory is probably what you want to use as the fallback in your
library, rather than `defaultLogger`. For example, in Graphile Worker we have a
default logger that factors the `workerId`, `taskIdentifier` and `jobId` into
the output log messages.

You can read more about this in the source of this library (which is short and
heavily documented); here's an illustrative example:

```ts
import { Logger, makeConsoleLogFactory } from "@graphile/logger";

interface LogScope {
  label?: string;
  workerId?: string;
  taskIdentifier?: string;
  jobId?: string;
}

const graphileWorkerDefaultLogger = new Logger<LogScope>(
  makeConsoleLogFactory({
    format: `[%s%s] %s: %s`,
    formatParameters(level, message, scope) {
      const taskText = scope.taskIdentifier ? `: ${scope.taskIdentifier}` : "";
      const jobIdText = scope.jobId ? `{${scope.jobId}}` : "";
      return [
        scope.label || "core",
        scope.workerId ? `(${scope.workerId}${taskText}${jobIdText})` : "",
        level.toUpperCase(),
        message,
      ];
    },
  }),
);

function worker(logger: Logger<LogScope> = graphileWorkerDefaultLogger) {
  logger.info("Starting worker cluster...");

  // ...

  const workerLogger = logger.scope({
    workerId: "3b0e05e1-beed-48a6-9d2b-055e47a29b5f",
  });
  workerLogger.info("Looking for jobs...");

  // ...

  const jobLogger = workerLogger.scope({
    taskIdentifier: "my_task",
    jobId: 84,
  });
  jobLogger.info("Starting job...");
}

worker();
```

which would output:

```
[core] INFO: Starting worker cluster...
[core(3b0e05e1-beed-48a6-9d2b-055e47a29b5f)] INFO: Looking for jobs...
[core(3b0e05e1-beed-48a6-9d2b-055e47a29b5f: my_task{84})] INFO: Starting job...
```
