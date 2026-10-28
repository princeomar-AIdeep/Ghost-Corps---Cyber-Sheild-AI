import { apiRequest } from '../lib/api.js'
import { createProfileApi } from './profileApi.js'

export const profileApi = createProfileApi(apiRequest)
