import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Poke } from "poke";
export class PokeNotifier {
    config;
    logger;
    statePath;
    poke;
    webhook;
    constructor(config, statePath, logger) {
        this.config = config;
        this.statePath = statePath;
        this.logger = logger.child({ component: "notifier" });
        const options = {};
        if (config.pokeApiBaseUrl) {
            options.baseUrl = config.pokeApiBaseUrl;
        }
        this.poke = new Poke(options);
    }
    async init() {
        mkdirSync(dirname(this.statePath), { recursive: true });
        const persisted = this.loadWebhookState();
        if (persisted) {
            this.webhook = persisted;
            this.logger.info("Using persisted webhook registration.");
            return;
        }
        if (!this.config.webhook.autoRegister) {
            this.logger.warn("Webhook auto-registration disabled and no persisted webhook found.");
            return;
        }
        try {
            const created = await this.poke.createWebhook({
                condition: this.config.webhook.condition,
                action: this.config.webhook.action
            });
            this.webhook = {
                triggerId: created.triggerId,
                webhookUrl: created.webhookUrl,
                webhookToken: created.webhookToken
            };
            this.persistWebhookState(this.webhook);
            this.logger.info({ triggerId: created.triggerId }, "Webhook registered and persisted.");
        }
        catch (error) {
            if (isPermissionError(error)) {
                this.logger.warn({ err: error }, "Webhook auto-registration skipped due to token permission scope. Runtime will continue without webhook notifications.");
                return;
            }
            throw error;
        }
    }
    async sendLongRunningStarted(command) {
        await this.send("command.long_running_started", command, {
            elapsedMs: Date.now() - Date.parse(command.startedAt)
        });
    }
    async sendHeartbeat(command) {
        await this.send("command.heartbeat", command, {
            elapsedMs: Date.now() - Date.parse(command.startedAt)
        });
    }
    async sendCompletion(command) {
        await this.send("command.completed", command, {
            elapsedMs: Date.now() - Date.parse(command.startedAt),
            status: command.status,
            exitCode: command.exitCode ?? null,
            endedAt: command.endedAt ?? null
        });
    }
    async sendRuntimeConnected(details) {
        const message = [
            "A new Poke-PC is connected and ready.",
            "You can use this machine as a full Ubuntu environment to run shell commands and workflows.",
            "Available capabilities:",
            "- Create and manage terminal sessions",
            "- Run shell commands in tmux windows",
            "- Check command status and capture output",
            "- Read/write files, create directories, and inspect filesystem paths",
            "- Tail logs and monitor long-running command progress",
            this.config.webhook.autoRegister
                ? "- Get real-time command progress updates via webhook notifications"
                : "",
            `MCP endpoint: ${details.mcpPublicUrl}`,
            `Tunnel name: ${details.tunnelName}`
        ].join("\n");
        await this.poke.sendMessage(message);
        this.logger.info({ mcpPublicUrl: details.mcpPublicUrl }, "Sent runtime onboarding notification.");
    }
    async send(eventName, command, payload) {
        if (!this.webhook) {
            this.logger.debug({ eventName, commandId: command.id }, "Skipping webhook send; no webhook configured.");
            return;
        }
        await this.poke.sendWebhook({
            webhookUrl: this.webhook.webhookUrl,
            webhookToken: this.webhook.webhookToken,
            data: {
                event: eventName,
                commandId: command.id,
                sessionName: command.sessionName,
                windowName: command.windowName,
                command: command.command,
                startedAt: command.startedAt,
                ...payload
            }
        });
    }
    loadWebhookState() {
        if (!existsSync(this.statePath)) {
            return undefined;
        }
        try {
            const raw = readFileSync(this.statePath, "utf8");
            const parsed = JSON.parse(raw);
            if (!parsed.triggerId || !parsed.webhookUrl || !parsed.webhookToken) {
                return undefined;
            }
            const state = {
                triggerId: parsed.triggerId,
                webhookUrl: parsed.webhookUrl,
                webhookToken: parsed.webhookToken
            };
            return state;
        }
        catch {
            return undefined;
        }
    }
    persistWebhookState(state) {
        writeFileSync(this.statePath, JSON.stringify(state, null, 2), {
            mode: 0o600
        });
    }
}
function isPermissionError(error) {
    const message = typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : String(error);
    const normalized = message.toLowerCase();
    return normalized.includes("doesn't have permission") || normalized.includes("permission");
}
//# sourceMappingURL=poke-notifier.js.map