import pino from "pino";
const level = process.env.LOG_LEVEL ?? "info";
const useStdio = process.env.MCP_TRANSPORT === 'stdio';
export const logger = pino({
    name: "poke-pc",
    level,
    ...(useStdio ? {} : {
        redact: {
            paths: [
                "config.pokeApiKey",
                "config.webhook.token",
                "pokeApiKey",
                "webhookToken"
            ],
            censor: "[REDACTED]"
        }
    }),
    ...(useStdio ? {} : {
        ...(process.env.NODE_ENV === "production"
            ? {}
            : {
                transport: {
                    target: "pino-pretty",
                    options: {
                        colorize: true,
                        translateTime: "SYS:standard"
                    }
                }
            })
    })
}, useStdio ? pino.destination(2) : undefined); // Output to stderr (fd 2) in stdio mode
//# sourceMappingURL=logger.js.map