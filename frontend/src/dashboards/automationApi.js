export function createAutomationApi(request) {
  if (typeof request !== 'function') {
    throw new TypeError('An automation request function is required.');
  }

  return {
    listWorkflows(options = {}) {
      return request('/automation/workflows', options);
    },
    createWorkflowDraft(payload, options = {}) {
      return request('/automation/workflows', { ...options, method: 'POST', body: payload });
    },
  };
}
