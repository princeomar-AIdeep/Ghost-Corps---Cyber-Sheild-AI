export function createTerminalApi(request) {
  if (typeof request !== 'function') {
    throw new TypeError('A terminal request function is required.');
  }

  return {
    submit(projectId, taskType, options = {}) {
      return request(`/projects/${encodeURIComponent(projectId)}/terminal/jobs`, {
        ...options,
        method: 'POST',
        body: { taskType },
      });
    },
    submitCommand(projectId, command, options = {}) {
      return request(`/projects/${encodeURIComponent(projectId)}/terminal/jobs`, {
        ...options,
        method: 'POST',
        body: { command },
      });
    },
    getStatus(projectId, jobId, options = {}) {
      return request(`/projects/${encodeURIComponent(projectId)}/terminal/jobs/${encodeURIComponent(jobId)}`, options);
    },
    cancel(projectId, jobId, options = {}) {
      return request(`/projects/${encodeURIComponent(projectId)}/terminal/jobs/${encodeURIComponent(jobId)}`, {
        ...options,
        method: 'DELETE',
      });
    },
  };
}
