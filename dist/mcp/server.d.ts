import type { Logger } from "pino";
import type { AppConfig } from "../config/config.js";
import type { TerminalManager } from "../terminal/terminal-manager.js";
export type RunningMcpServer = {
    close: () => Promise<void>;
};
type Dependencies = {
    config: AppConfig;
    terminal: TerminalManager;
    logger: Logger;
};
export declare function startMcpServer({ config, terminal, logger }: Dependencies): Promise<RunningMcpServer>;
export {};
