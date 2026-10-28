import { apiRequest } from '../lib/api.js'
import { createReportsApi } from './reportsApi.js'

export const reportsApi = createReportsApi(apiRequest)
