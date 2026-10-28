import { apiRequest } from '../lib/api.js'
import { createAutomationApi } from './automationApi.js'

export const automationApi = createAutomationApi(apiRequest)
