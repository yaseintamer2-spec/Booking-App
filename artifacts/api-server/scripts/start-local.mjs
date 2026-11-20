import { existsSync } from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(import.meta.dirname, '../../../.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);
process.env.PORT ||= '5000';

await import('../dist/index.mjs');
