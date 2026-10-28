import { apiRequest } from '../lib/api.js';
import { createPreviewApi } from './previewApi.js';

export const previewApi = createPreviewApi(apiRequest);