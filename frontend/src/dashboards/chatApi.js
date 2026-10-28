export function createChatApi(request) {
  if (typeof request !== 'function') {
    throw new TypeError('A chat request function is required.');
  }

  return {
    send(payload, options = {}) {
      return request('/chat', { ...options, method: 'POST', body: payload });
    },
    history(sessionId, options = {}) {
      const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
      return request(`/chat/history${query}`, options);
    },
    clearHistory(sessionId, options = {}) {
      const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
      return request(`/chat/history${query}`, { ...options, method: 'DELETE' });
    },
  };
}
