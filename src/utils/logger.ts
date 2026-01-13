// src/utils/logger.ts
import { consola, type ConsolaInstance } from 'consola';

/**
 * Create a logger instance with a specific tag
 * Uses Consola for beautiful, structured logging
 */
export function createLogger(tag: string): ConsolaInstance {
    return consola.withTag(tag);
}

export type Logger = ConsolaInstance;
