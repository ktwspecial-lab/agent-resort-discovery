import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

copyFileSync(resolve('worker/analytics-entry.js'), resolve('dist/server/analytics-entry.js'));
console.log('Analytics Worker entry prepared.');
