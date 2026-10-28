export function createDashboardDataApi(request) {
  if (typeof request !== 'function') {
    throw new TypeError('A dashboard data request function is required.')
  }

  const readList = async (endpoint, property) => {
    const response = await request(endpoint)
    const items = Array.isArray(response)
      ? response
      : response && Array.isArray(response[property])
        ? response[property]
        : null

    if (!items) {
      throw new Error(`Dashboard ${property} response did not match the API contract.`)
    }
    return items
  }

  return {
    loadProjects() {
      return readList('/projects', 'projects')
    },
    loadTasks() {
      return readList('/tasks', 'tasks')
    },
    loadScans() {
      return readList('/scans', 'scans')
    },
    async loadOverview() {
      const [projects, tasks, scans] = await Promise.all([
        this.loadProjects(),
        this.loadTasks(),
        this.loadScans(),
      ])
      return { projects, tasks, scans }
    },
    async updateTask(taskId, updates) {
      const response = await request(`/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PUT',
        body: updates,
      })
      if (
        !response ||
        response._id !== taskId ||
        Object.entries(updates).some(([key, value]) => response[key] !== value)
      ) {
        throw new Error('Task update response did not confirm the requested changes.')
      }
      return response
    },
  }
}
