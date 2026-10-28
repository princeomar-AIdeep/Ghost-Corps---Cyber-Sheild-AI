import { apiRequest } from '../lib/api.js'
import { createGitHubApi } from './githubApi.js'

export const githubApi = createGitHubApi(apiRequest)
