#!/usr/bin/env node
import { loadConfig, getTerminalStatePath, getWebhookStatePath, getTunnelStatePath } from "./config/config.js";
import { logger } from "./logger.js";
import { runBootstrap } from "./bootstrap/bootstrap.js";
import { TerminalManager } from "./terminal/terminal-manager.js";
import { PokeNotifier } from "./notifier/poke-notifier.js";
import { CommandMonitor } from "./notifier/command-monitor.js";
import { startMcpServer } from "./mcp/server.js";
import { TunnelManager } from "./tunnel/tunnel-manager.js";
import { ensurePokeLogin } from "./auth/poke-auth.js";
async function main() {
    const config = loadConfig();
    const appLogger = logger.child({ component: "main" });
    // 检查是否使用 stdio 传输协议
    const useStdio = process.env.MCP_TRANSPORT === 'stdio';
    appLogger.info({
        mcpHost: config.mcpHost,
        mcpPort: config.mcpPort,
        tunnelName: config.tunnelName,
        mcpPublicUrl: config.mcpPublicUrl,
        transport: useStdio ? 'stdio' : 'streamable-http'
    }, "Starting Poke PC runtime.");
    // 在 stdio 模式下跳过 Poke 登录
    if (!useStdio) {
        await ensurePokeLogin(config, logger);
    }
    else {
        appLogger.info("Skipping poke login in stdio mode");
    }
    const terminal = new TerminalManager(getTerminalStatePath(config), logger);
    await terminal.init(config.sessions.restoreOnStartup);
    await runBootstrap(config, logger);
    let notifier;
    let monitor;
    // 在 stdio 模式下跳过 notifier 和 monitor
    if (!useStdio) {
        notifier = new PokeNotifier(config, getWebhookStatePath(config), logger);
        await notifier.init();
        monitor = new CommandMonitor(config, terminal, notifier, logger);
        monitor.start();
    }
    else {
        appLogger.info("Skipping notifier and monitor in stdio mode");
    }
    const mcp = await startMcpServer({ config, terminal, logger });
    // 在 stdio 模式下跳过通知器发送
    if (!useStdio) {
        await notifier.sendRuntimeConnected({
            mcpPublicUrl: config.mcpPublicUrl,
            tunnelName: config.tunnelName
        });
        // 在 stdio 模式下跳过 tunnel
        const tunnel = new TunnelManager(config, getTunnelStatePath(config), logger);
        const tunnelPromise = tunnel.start();
        const shutdown = async (signal) => {
            appLogger.info({ signal }, "Shutdown requested.");
            monitor.stop();
            await Promise.allSettled([tunnel.stop(), tunnel.cleanupConnection(), mcp.close()]);
            process.exit(0);
        };
        process.on("SIGINT", () => {
            void shutdown("SIGINT");
        });
        process.on("SIGTERM", () => {
            void shutdown("SIGTERM");
        });
        await tunnelPromise;
    }
    else {
        // stdio 模式下的关闭处理
        const shutdown = async (signal) => {
            appLogger.info({ signal }, "Shutdown requested.");
            if (monitor) {
                monitor.stop();
            }
            await Promise.allSettled([mcp.close()]);
            process.exit(0);
        };
        process.on("SIGINT", () => {
            void shutdown("SIGINT");
        });
        process.on("SIGTERM", () => {
            void shutdown("SIGTERM");
        });
    }
}
main().catch((error) => {
    logger.error({ err: error }, "Fatal startup error.");
    process.exit(1);
});
//# sourceMappingURL=index.js.map