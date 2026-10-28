export function createProfileApi(request) {
  if (typeof request !== 'function') {
    throw new TypeError('A profile request function is required.');
  }

  return {
    getMe(options = {}) {
      return request('/users/me', options);
    },
    updateMe(profile, options = {}) {
      return request('/users/me', {
        ...options,
        method: 'PUT',
        body: profile,
      });
    },
  };
}
