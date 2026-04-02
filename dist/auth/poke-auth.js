import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { isLoggedIn, login } from "poke";
function getCredentialsPath() {
    const xdgConfigHome = process.env.XDG_CONFIG_HOME;
    const configRoot = xdgConfigHome ? xdgConfigHome : join(homedir(), ".config");
    return join(configRoot, "poke", "credentials.json");
}
export async function ensurePokeLogin(config, logger) {
    const credentialsPath = getCredentialsPath();
    const credentialsPresent = existsSync(credentialsPath);
    if (credentialsPresent && isLoggedIn()) {
        logger.info({ credentialsPath }, "Using existing poke login credentials.");
        return;
    }
    logger.warn({ credentialsPath }, "Tunnel requires poke login credentials. Starting interactive device login.");
    const loginOptions = {
        openBrowser: false,
        onCode: ({ userCode, loginUrl }) => {
            logger.warn({ userCode, loginUrl }, "Complete login in browser, then restart container once authenticated.");
        }
    };
    if (config.pokeApiBaseUrl) {
        loginOptions.baseUrl = config.pokeApiBaseUrl;
    }
    await login(loginOptions);
    logger.info({ credentialsPath }, "Poke login completed and credentials saved.");
}
//# sourceMappingURL=poke-auth.js.map