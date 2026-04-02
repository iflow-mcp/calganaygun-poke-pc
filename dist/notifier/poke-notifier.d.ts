import type { Logger } from "pino";
import type { AppConfig } from "../config/config.js";
import type { CommandRecord } from "../terminal/terminal-manager.js";
export declare class PokeNotifier {
    private readonly config;
    private readonly logger;
    private readonly statePath;
    private readonly poke;
    private webhook?;
    constructor(config: AppConfig, statePath: string, logger: Logger);
    init(): Promise<void>;
    sendLongRunningStarted(command: CommandRecord): Promise<void>;
    sendHeartbeat(command: CommandRecord): Promise<void>;
    sendCompletion(command: CommandRecord): Promise<void>;
    sendRuntimeConnected(details: {
        mcpPublicUrl: string;
        tunnelName: string;
    }): Promise<void>;
    private send;
    private loadWebhookState;
    private persistWebhookState;
}
