export function createWorkspaceFilesApi(request) {
  if (typeof request !== 'function') {
    throw new TypeError('A workspace file request function is required.');
  }

  const projectPath = (projectId) => `/projects/${encodeURIComponent(projectId)}/files`;

  return {
    list(projectId, options = {}) {
      return request(projectPath(projectId), options);
    },
    read(projectId, path, options = {}) {
      return request(`${projectPath(projectId)}/file?path=${encodeURIComponent(path)}`, options);
    },
    exportSource(projectId, options = {}) {
      return request(`${projectPath(projectId)}/export`, { ...options, responseType: 'blob' });
    },
    create(projectId, path, content, options = {}) {
      return request(projectPath(projectId), {
        ...options,
        method: 'POST',
        body: { path, content },
      });
    },
    update(projectId, path, content, options = {}) {
      return request(`${projectPath(projectId)}/file`, {
        ...options,
        method: 'PUT',
        body: { path, content },
      });
    },
    rename(projectId, fromPath, toPath, options = {}) {
      return request(`${projectPath(projectId)}/rename`, {
        ...options,
        method: 'POST',
        body: { fromPath, toPath },
      });
    },
    delete(projectId, path, options = {}) {
      return request(`${projectPath(projectId)}/file`, {
        ...options,
        method: 'DELETE',
        body: { path },
      });
    },
  };
}
