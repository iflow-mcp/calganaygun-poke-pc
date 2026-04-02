export type AppConfig = {
    pokeApiBaseUrl: string | undefined;
    tunnelName: string;
    mcpPort: number;
    mcpHost: string;
    mcpPublicUrl: string;
    stateDir: string;
    bootstrap: {
        configPath?: string;
        commandList?: string;
        strict: boolean;
    };
    sessions: {
        restoreOnStartup: boolean;
    };
    webhook: {
        autoRegister: boolean;
        condition: string;
        action: string;
        longRunningThresholdMs: number;
        heartbeatIntervalMs: number;
        monitorIntervalMs: number;
    };
    tunnel: {
        syncIntervalMs: number;
    };
};
export declare function loadConfig(rawEnv?: NodeJS.ProcessEnv): AppConfig;
export declare function getWebhookStatePath(config: AppConfig): string;
export declare function getTerminalStatePath(config: AppConfig): string;
export declare function getTunnelStatePath(config: AppConfig): string;
