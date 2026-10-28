export function createPreviewApi(request) {
  if (typeof request !== 'function') {
    throw new TypeError('A preview request function is required.');
  }

  return {
    start(projectId, payload, options = {}) {
      return request(`/projects/${encodeURIComponent(projectId)}/preview/sessions`, {
        ...options,
        method: 'POST',
        body: payload,
      });
    },
    getStatus(projectId, sessionId, options = {}) {
      return request(`/projects/${encodeURIComponent(projectId)}/preview/sessions/${encodeURIComponent(sessionId)}`, options);
    },
    stop(projectId, sessionId, options = {}) {
      return request(`/projects/${encodeURIComponent(projectId)}/preview/sessions/${encodeURIComponent(sessionId)}`, {
        ...options,
        method: 'DELETE',
      });
    },
  };
}