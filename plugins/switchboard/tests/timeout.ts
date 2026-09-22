import { setDefaultTimeout } from 'bun:test';

// Upstream runs node --test --test-timeout=120000; launcher tests spawn real processes.
setDefaultTimeout(120000);
