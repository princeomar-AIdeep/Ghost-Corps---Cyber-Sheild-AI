export function createGitHubApi(request) {
  if (typeof request !== 'function') {
    throw new TypeError('A GitHub request function is required.');
  }

  return {
    async getConnection(options = {}) {
      const result = await request('/github/connection', options);
      if (
        !result ||
        typeof result.available !== 'boolean' ||
        typeof result.connected !== 'boolean'
      ) {
        throw new Error('GitHub connection response did not match the API contract.');
      }
      return result;
    },
    disconnect(options = {}) {
      return request('/github/connection', { ...options, method: 'DELETE' });
    },
    async startAuthorization(options = {}) {
      const result = await request('/github/connect', { ...options, method: 'POST' });
      let authorizationUrl;
      try {
        authorizationUrl = new URL(result?.authorizationUrl);
      } catch {
        throw new Error('GitHub authorization response did not match the API contract.');
      }
      if (
        authorizationUrl.protocol !== 'https:' ||
        authorizationUrl.hostname !== 'github.com' ||
        authorizationUrl.pathname !== '/login/oauth/authorize' ||
        authorizationUrl.username ||
        authorizationUrl.password
      ) {
        throw new Error('GitHub authorization URL is not an approved GitHub destination.');
      }
      return { authorizationUrl: authorizationUrl.toString() };
    },
    async listRepositories(options = {}) {
      const result = await request('/github/repositories', options);
      if (!result || !Array.isArray(result.repositories)) {
        throw new Error('GitHub repositories response did not match the API contract.');
      }
      return {
        repositories: result.repositories.map((repository) => {
          if (
            !repository ||
            !Number.isSafeInteger(repository.id) ||
            typeof repository.fullName !== 'string' ||
            typeof repository.private !== 'boolean' ||
            typeof repository.htmlUrl !== 'string' ||
            typeof repository.defaultBranch !== 'string'
          ) {
            throw new Error('GitHub repository response did not match the API contract.');
          }
          let repositoryUrl;
          try {
            repositoryUrl = new URL(repository.htmlUrl);
          } catch {
            throw new Error('GitHub repository response contained an invalid URL.');
          }
          if (repositoryUrl.protocol !== 'https:' || repositoryUrl.hostname !== 'github.com') {
            throw new Error('GitHub repository response contained an unapproved URL.');
          }
          return {
            id: repository.id,
            name: typeof repository.name === 'string' ? repository.name : '',
            fullName: repository.fullName,
            private: repository.private,
            htmlUrl: repositoryUrl.toString(),
            defaultBranch: repository.defaultBranch,
          };
        }),
      };
    },
    async listBranches(owner, repository, options = {}) {
      const result = await request(`/github/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/branches`, options);
      if (!result || !Array.isArray(result.branches)) throw new Error('GitHub branches response did not match the API contract.');
      return {
        branches: result.branches.map((branch) => {
          if (!branch || typeof branch.name !== 'string' || typeof branch.commitSha !== 'string') {
            throw new Error('GitHub branches response did not match the API contract.');
          }
          return { name: branch.name, commitSha: branch.commitSha };
        }),
      };
    },
    async getRepositoryFile(owner, repository, filePath, ref, options = {}) {
      const query = new URLSearchParams({ path: filePath, ...(ref ? { ref } : {}) });
      const result = await request(`/github/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents?${query}`, options);
      if (!result || typeof result.path !== 'string' || typeof result.content !== 'string' || typeof result.sha !== 'string') {
        throw new Error('GitHub file response did not match the API contract.');
      }
      return { path: result.path, content: result.content, sha: result.sha };
    },
    async commitRepositoryFile(owner, repository, payload, options = {}) {
      const result = await request(`/github/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents`, {
        ...options,
        method: 'PUT',
        body: payload,
      });
      if (!result || typeof result.commitSha !== 'string' || typeof result.path !== 'string') {
        throw new Error('GitHub commit response did not match the API contract.');
      }
      return result;
    },
  };
}
