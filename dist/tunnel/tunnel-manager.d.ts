import { type TunnelInfo } from "poke";
import type { Logger } from "pino";
import type { AppConfig } from "../config/config.js";
export declare class TunnelManager {
    private readonly config;
    private readonly statePath;
    private readonly logger;
    private running;
    private currentTunnel;
    private currentInfo;
    private connectionId;
    constructor(config: AppConfig, statePath: string, logger: Logger);
    get connected(): boolean;
    get info(): TunnelInfo | undefined;
    start(): Promise<void>;
    stop(): Promise<void>;
    cleanupConnection(): Promise<void>;
    private startOneTunnelSession;
    private loadState;
    private saveState;
}
