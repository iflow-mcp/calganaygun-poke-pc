import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawn } from "node:child_process";
import { z } from "zod";
const CONTROL_SESSION_NAME = "__poke_pc_control__";
const stateSchema = z.object({
    sessions: z.array(z.string()).default([]),
    commands: z
        .array(z.object({
        id: z.string(),
        sessionName: z.string(),
        windowName: z.string(),
        command: z.string(),
        startedAt: z.string(),
        endedAt: z.string().optional(),
        exitCode: z.number().int().optional(),
        status: z.enum(["running", "completed", "failed", "lost"]),
        longRunningNotified: z.boolean().default(false),
        completionNotified: z.boolean().default(false),
        lastHeartbeatAt: z.string().optional()
    }))
        .default([])
});
export class TerminalManager {
    statePath;
    historyPath;
    logger;
    state;
    constructor(statePath, logger) {
        this.statePath = statePath;
        this.historyPath = `${dirname(statePath)}/history.ndjson`;
        this.logger = logger.child({ component: "terminal" });
        this.state = this.loadState();
    }
    async init(restoreSessions) {
        this.logger.info({ restoreSessions }, "Initializing terminal manager.");
        await this.ensureTmuxAvailable();
        await this.ensureTmuxServerReady();
        await this.runTmux(["set-option", "-g", "remain-on-exit", "on"]);
        await this.runTmux(["set-option", "-g", "history-limit", "50000"]);
        if (restoreSessions) {
            await this.restoreSessions();
        }
        await this.refreshAllCommandStatuses();
        this.logger.info({
            sessionCount: this.state.sessions.length,
            commandCount: this.state.commands.length
        }, "Terminal manager initialized.");
    }
    listSessionsFromState() {
        return [...this.state.sessions];
    }
    async listActiveTmuxSessions() {
        const result = await this.runTmux(["list-sessions", "-F", "#{session_name}"], true);
        if (result.exitCode !== 0 || result.stdout.trim().length === 0) {
            return [];
        }
        return result.stdout
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .filter((line) => line !== CONTROL_SESSION_NAME);
    }
    async ensureSession(sessionName) {
        const check = await this.runTmux(["has-session", "-t", sessionName], true);
        if (check.exitCode !== 0) {
            await this.runTmux(["new-session", "-d", "-s", sessionName]);
            this.logger.info({ sessionName }, "Created tmux session.");
        }
        if (!this.state.sessions.includes(sessionName)) {
            this.state.sessions.push(sessionName);
            this.saveState();
        }
    }
    async killSession(sessionName) {
        if (sessionName === CONTROL_SESSION_NAME) {
            throw new Error("Cannot kill internal control session");
        }
        await this.runTmux(["kill-session", "-t", sessionName]);
        this.logger.info({ sessionName }, "Killed tmux session.");
        this.state.sessions = this.state.sessions.filter((name) => name !== sessionName);
        this.appendHistory("session_killed", { sessionName });
        for (const command of this.state.commands) {
            if (command.sessionName === sessionName && command.status === "running") {
                command.status = "lost";
                command.endedAt = new Date().toISOString();
                this.appendHistory("command_lost", {
                    commandId: command.id,
                    sessionName: command.sessionName,
                    windowName: command.windowName,
                    command: command.command,
                    endedAt: command.endedAt
                });
            }
        }
        this.saveState();
    }
    async runCommand(sessionName, command) {
        await this.ensureSession(sessionName);
        const commandId = randomUUID();
        const windowName = `cmd-${commandId.slice(0, 8)}`;
        const shellCommand = `bash -lc ${singleQuote(command)}`;
        await this.runTmux([
            "new-window",
            "-d",
            "-t",
            sessionName,
            "-n",
            windowName,
            shellCommand
        ]);
        const record = {
            id: commandId,
            sessionName,
            windowName,
            command,
            startedAt: new Date().toISOString(),
            endedAt: undefined,
            exitCode: undefined,
            status: "running",
            longRunningNotified: false,
            completionNotified: false,
            lastHeartbeatAt: undefined
        };
        this.state.commands.push(record);
        this.saveState();
        this.logger.info({ commandId, sessionName, windowName }, "Command started.");
        this.appendHistory("command_started", {
            commandId: record.id,
            sessionName: record.sessionName,
            windowName: record.windowName,
            command: record.command,
            startedAt: record.startedAt
        });
        return record;
    }
    getCommandById(commandId) {
        return this.state.commands.find((command) => command.id === commandId);
    }
    listCommands(limit = 50) {
        return [...this.state.commands]
            .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
            .slice(0, limit);
    }
    getRunningCommands() {
        return this.state.commands.filter((command) => command.status === "running");
    }
    markLongRunningNotified(commandId, heartbeatAt) {
        const command = this.getCommandById(commandId);
        if (!command) {
            return;
        }
        command.longRunningNotified = true;
        if (heartbeatAt) {
            command.lastHeartbeatAt = heartbeatAt.toISOString();
        }
        this.saveState();
    }
    markHeartbeat(commandId, heartbeatAt) {
        const command = this.getCommandById(commandId);
        if (!command) {
            return;
        }
        command.lastHeartbeatAt = heartbeatAt.toISOString();
        this.saveState();
    }
    markCompletionNotified(commandId) {
        const command = this.getCommandById(commandId);
        if (!command) {
            return;
        }
        command.completionNotified = true;
        this.saveState();
    }
    async refreshAllCommandStatuses() {
        const changed = [];
        for (const command of this.state.commands) {
            if (command.status !== "running") {
                continue;
            }
            const before = command.status;
            await this.refreshCommandStatus(command);
            if (command.status !== before) {
                changed.push(command);
                this.logger.info({
                    commandId: command.id,
                    status: command.status,
                    exitCode: command.exitCode
                }, "Command status changed.");
                this.appendHistory("command_status_changed", {
                    commandId: command.id,
                    sessionName: command.sessionName,
                    windowName: command.windowName,
                    command: command.command,
                    status: command.status,
                    exitCode: command.exitCode,
                    endedAt: command.endedAt
                });
            }
        }
        if (changed.length > 0) {
            this.saveState();
        }
        return changed;
    }
    async captureOutput(commandId, lines = 200) {
        const command = this.getCommandById(commandId);
        if (!command) {
            throw new Error(`Command not found: ${commandId}`);
        }
        const target = `${command.sessionName}:${command.windowName}`;
        const result = await this.runTmux([
            "capture-pane",
            "-p",
            "-t",
            target,
            "-S",
            `-${Math.max(1, lines).toString()}`
        ], true);
        if (result.exitCode !== 0) {
            return "";
        }
        return result.stdout;
    }
    async refreshCommandStatus(command) {
        const target = `${command.sessionName}:${command.windowName}`;
        const probe = await this.runTmux([
            "list-panes",
            "-t",
            target,
            "-F",
            "#{pane_dead} #{pane_dead_status}"
        ], true);
        if (probe.exitCode !== 0) {
            command.status = "lost";
            command.endedAt = command.endedAt ?? new Date().toISOString();
            this.logger.warn({ commandId: command.id }, "Command window no longer exists.");
            return;
        }
        const firstLine = probe.stdout.split("\n").find((line) => line.trim().length > 0);
        if (!firstLine) {
            return;
        }
        const [paneDeadRaw, paneStatusRaw] = firstLine.trim().split(/\s+/);
        const paneDead = paneDeadRaw === "1";
        if (!paneDead) {
            return;
        }
        const exitCode = Number.parseInt(paneStatusRaw ?? "1", 10);
        command.exitCode = Number.isNaN(exitCode) ? 1 : exitCode;
        command.status = command.exitCode === 0 ? "completed" : "failed";
        command.endedAt = command.endedAt ?? new Date().toISOString();
    }
    async restoreSessions() {
        for (const sessionName of this.state.sessions) {
            await this.ensureSession(sessionName);
            this.appendHistory("session_restored", { sessionName });
        }
        if (this.state.sessions.length > 0) {
            this.logger.info({ count: this.state.sessions.length }, "Restored persisted tmux sessions.");
        }
    }
    async ensureTmuxServerReady() {
        const hasSession = await this.runTmux(["has-session", "-t", CONTROL_SESSION_NAME], true);
        if (hasSession.exitCode !== 0) {
            await this.runTmux(["new-session", "-d", "-s", CONTROL_SESSION_NAME]);
        }
    }
    loadState() {
        mkdirSync(dirname(this.statePath), { recursive: true });
        try {
            const raw = readFileSync(this.statePath, "utf8");
            const parsed = stateSchema.parse(JSON.parse(raw));
            return {
                sessions: parsed.sessions,
                commands: parsed.commands.map((item) => ({
                    id: item.id,
                    sessionName: item.sessionName,
                    windowName: item.windowName,
                    command: item.command,
                    startedAt: item.startedAt,
                    endedAt: item.endedAt,
                    exitCode: item.exitCode,
                    status: item.status,
                    longRunningNotified: item.longRunningNotified,
                    completionNotified: item.completionNotified,
                    lastHeartbeatAt: item.lastHeartbeatAt
                }))
            };
        }
        catch {
            const emptyState = { sessions: [], commands: [] };
            writeFileSync(this.statePath, JSON.stringify(emptyState, null, 2));
            return emptyState;
        }
    }
    saveState() {
        writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
    }
    appendHistory(type, data) {
        const entry = {
            timestamp: new Date().toISOString(),
            type,
            ...data
        };
        appendFileSync(this.historyPath, `${JSON.stringify(entry)}\n`);
    }
    async ensureTmuxAvailable() {
        const result = await this.runTmux(["-V"], true);
        if (result.exitCode !== 0) {
            throw new Error("tmux is required but not available in PATH");
        }
    }
    runTmux(args, allowFailure = false) {
        return new Promise((resolve, reject) => {
            const child = spawn("tmux", args, {
                stdio: ["ignore", "pipe", "pipe"],
                env: process.env
            });
            let stdout = "";
            let stderr = "";
            child.stdout.on("data", (chunk) => {
                stdout += String(chunk);
            });
            child.stderr.on("data", (chunk) => {
                stderr += String(chunk);
            });
            child.on("error", (error) => {
                reject(error);
            });
            child.on("close", (code) => {
                const exitCode = code ?? 1;
                if (!allowFailure && exitCode !== 0) {
                    reject(new Error(`tmux ${args.join(" ")} failed: ${stderr.trim() || stdout.trim()}`));
                    return;
                }
                resolve({ stdout, stderr, exitCode });
            });
        });
    }
}
function singleQuote(command) {
    return `'${command.replaceAll("'", `'"'"'`)}'`;
}
//# sourceMappingURL=terminal-manager.js.map