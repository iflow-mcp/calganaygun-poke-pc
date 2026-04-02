import type { Logger } from "pino";
import type { AppConfig } from "../config/config.js";
export declare function ensurePokeLogin(config: AppConfig, logger: Logger): Promise<void>;
