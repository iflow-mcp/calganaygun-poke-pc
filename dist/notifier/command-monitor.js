export class CommandMonitor {
    config;
    terminal;
    notifier;
    logger;
    timer;
    constructor(config, terminal, notifier, logger) {
        this.config = config;
        this.terminal = terminal;
        this.notifier = notifier;
        this.logger = logger.child({ component: "command-monitor" });
    }
    start() {
        if (this.timer) {
            return;
        }
        this.logger.info({
            monitorIntervalMs: this.config.webhook.monitorIntervalMs,
            longRunningThresholdMs: this.config.webhook.longRunningThresholdMs,
            heartbeatIntervalMs: this.config.webhook.heartbeatIntervalMs
        }, "Command monitor started.");
        this.timer = setInterval(() => {
            void this.tick();
        }, this.config.webhook.monitorIntervalMs);
        this.timer.unref();
        void this.tick();
    }
    stop() {
        if (!this.timer) {
            return;
        }
        clearInterval(this.timer);
        this.timer = undefined;
        this.logger.info("Command monitor stopped.");
    }
    async tick() {
        try {
            await this.terminal.refreshAllCommandStatuses();
            for (const command of this.terminal.listCommands(500)) {
                if (command.status === "running") {
                    await this.handleRunningCommand(command.id);
                    continue;
                }
                if (!command.completionNotified) {
                    await this.notifier.sendCompletion(command);
                    this.terminal.markCompletionNotified(command.id);
                    this.logger.info({ commandId: command.id }, "Completion notification sent.");
                }
            }
        }
        catch (error) {
            this.logger.error({ err: error }, "Command monitor tick failed.");
        }
    }
    async handleRunningCommand(commandId) {
        const command = this.terminal.getCommandById(commandId);
        if (!command || command.status !== "running") {
            return;
        }
        const now = new Date();
        const elapsedMs = now.getTime() - Date.parse(command.startedAt);
        if (elapsedMs < this.config.webhook.longRunningThresholdMs) {
            return;
        }
        if (!command.longRunningNotified) {
            await this.notifier.sendLongRunningStarted(command);
            this.terminal.markLongRunningNotified(command.id, now);
            this.logger.info({ commandId: command.id }, "Long-running notification sent.");
            return;
        }
        const lastHeartbeatMs = command.lastHeartbeatAt
            ? Date.parse(command.lastHeartbeatAt)
            : 0;
        if (now.getTime() - lastHeartbeatMs >= this.config.webhook.heartbeatIntervalMs) {
            await this.notifier.sendHeartbeat(command);
            this.terminal.markHeartbeat(command.id, now);
            this.logger.info({ commandId: command.id }, "Heartbeat notification sent.");
        }
    }
}
//# sourceMappingURL=command-monitor.js.map