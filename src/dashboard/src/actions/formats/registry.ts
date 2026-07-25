/**
 * Format handler registry — the single integration point for all upload formats.
 *
 * To add a new format:
 *   1. Implement FileFormatHandler in a new module under formats/
 *   2. Import the handler here and call registerHandler(handler)
 *
 * No other file (including finalizeUpload in endpoints.ts) needs to change.
 */

import { registerHandler } from './index';
import { csvHandler } from './csv';
import { xlsxHandler } from './xlsx';
import { xlsHandler } from './xls';
import { xmlHandler } from './xml';
import { jsonHandler } from './json';
import { iniHandler } from './ini';

registerHandler(csvHandler);
registerHandler(xlsxHandler);
registerHandler(xlsHandler);
registerHandler(xmlHandler);
registerHandler(jsonHandler);
registerHandler(iniHandler);
