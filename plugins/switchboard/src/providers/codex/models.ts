// Compatibility stub. MODELS and OPENAI_WORKERS are retired; CATALOG in src/catalog.ts
// is the source of truth. Tests in native-gateway.test.ts that reference OPENAI_WORKERS
// will fail on assertion; Task 10 retires those tests.
import type { Effort } from './responses.ts';

export interface Worker {
  model: string;
  effort: Effort;
}

export const MODELS: Record<string, string> = {};
export const OPENAI_WORKERS: Readonly<Record<string, Worker>> = Object.freeze({});
