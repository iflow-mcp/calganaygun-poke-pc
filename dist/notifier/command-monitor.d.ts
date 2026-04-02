import type { Logger } from "pino";
import type { AppConfig } from "../config/config.js";
import type { PokeNotifier } from "./poke-notifier.js";
import type { TerminalManager } from "../terminal/terminal-manager.js";
export declare class CommandMonitor {
    private readonly config;
    private readonly terminal;
    private readonly notifier;
    private readonly logger;
    private timer;
    constructor(config: AppConfig, terminal: TerminalManager, notifier: PokeNotifier, logger: Logger);
    start(): void;
    stop(): void;
    private tick;
    private handleRunningCommand;
}
