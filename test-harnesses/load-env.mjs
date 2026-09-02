/**
 * Walk up from this file and load the first instance `.env` (DB_*). Same helper as committees/orders.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export function loadInstanceEnv(startDir) {
    const loaded = [];
    const appLocal = path.resolve(startDir, '..', '.env');
    if (fs.existsSync(appLocal)) {
        dotenv.config({ path: appLocal, quiet: true });
        loaded.push(appLocal);
    }

    let dir = path.resolve(startDir);
    let searched = 0;
    while (searched < 12) {
        for (const candidate of [path.join(dir, '.env'), path.join(dir, 'mj', '.env')]) {
            if (fs.existsSync(candidate) && !loaded.includes(candidate)) {
                dotenv.config({ path: candidate, quiet: true });
                loaded.push(candidate);
            }
        }
        if (process.env.DB_DATABASE) break;
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
        searched++;
    }
    return { loaded, searched };
}

export function loadEnvFrom(importMetaUrl) {
    return loadInstanceEnv(path.dirname(fileURLToPath(importMetaUrl)));
}
