import { apiRequest } from '../lib/api.js';
import { createTerminalApi } from './terminalApi.js';

export const terminalApi = createTerminalApi(apiRequest);
