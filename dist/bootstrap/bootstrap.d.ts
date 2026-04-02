import type { Logger } from "pino";
import type { AppConfig } from "../config/config.js";
export declare function runBootstrap(config: AppConfig, logger: Logger): Promise<void>;
