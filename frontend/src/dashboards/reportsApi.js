export function createReportsApi(request) {
  if (typeof request !== 'function') {
    throw new TypeError('A reports request function is required.');
  }

  return {
    list(options = {}) {
      return request('/reports', options);
    },
    create(payload, options = {}) {
      return request('/reports', { ...options, method: 'POST', body: payload });
    },
    remove(reportId, options = {}) {
      return request(`/reports/${encodeURIComponent(reportId)}`, {
        ...options,
        method: 'DELETE',
      });
    },
  };
}
