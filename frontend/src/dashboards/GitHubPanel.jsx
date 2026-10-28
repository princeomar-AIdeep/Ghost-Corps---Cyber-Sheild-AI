import { useEffect, useState } from 'react'
import { ExternalLink, Github, RefreshCw, GitBranch, Download, Upload } from 'lucide-react'
import { githubApi } from './githubService.js'

export default function GitHubPanel({ workspace }) {
  const [connection, setConnection] = useState(null)
  const [repositories, setRepositories] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [callbackNotice, setCallbackNotice] = useState('')
  const [selectedRepository, setSelectedRepository] = useState(null)
  const [branches, setBranches] = useState([])
  const [selectedBranch, setSelectedBranch] = useState('')
  const [repositoryPath, setRepositoryPath] = useState('README.md')
  const [repositoryFile, setRepositoryFile] = useState(null)
  const [operationMessage, setOperationMessage] = useState('')

  const refreshConnection = async (signal) => {
    setLoading(true)
    setError('')
    try {
      const status = await githubApi.getConnection({ signal })
      setConnection(status)
      if (status.connected && status.available) {
        const result = await githubApi.listRepositories({ signal })
        setRepositories(result.repositories)
      } else {
        setRepositories([])
      }
    } catch (requestError) {
      if (requestError?.name !== 'AbortError') {
        setError(requestError instanceof Error ? requestError.message : 'GitHub status could not be loaded.')
      }
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    const url = new URL(window.location.href)
    const callbackResult = url.searchParams.get('github')
    if (callbackResult === 'connected') {
      setCallbackNotice('GitHub authorization completed. Checking the authenticated connection now.')
    } else if (callbackResult === 'error') {
      setCallbackNotice('GitHub authorization did not complete. You can retry or refresh the connection status.')
    }
    if (callbackResult !== null) {
      url.searchParams.delete('github')
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    }
    refreshConnection(controller.signal)
    return () => controller.abort()
  }, [])

  const connectGitHub = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await githubApi.startAuthorization()
      window.location.assign(result.authorizationUrl)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'GitHub authorization could not be started.')
    } finally {
      setBusy(false)
    }
  }

  const refresh = async () => {
    setBusy(true)
    try {
      await refreshConnection()
    } finally {
      setBusy(false)
    }
  }

  const loadBranches = async (repository) => {
    setBusy(true)
    setError('')
    setSelectedRepository(repository)
    setRepositoryFile(null)
    try {
      const result = await githubApi.listBranches(repository.fullName.split('/')[0], repository.name)
      setBranches(result.branches)
      setSelectedBranch(repository.defaultBranch || result.branches[0]?.name || '')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Branches could not be loaded.')
    } finally {
      setBusy(false)
    }
  }

  const pullRepositoryFile = async () => {
    if (!selectedRepository || !selectedBranch || !repositoryPath.trim()) return
    setBusy(true)
    setError('')
    try {
      const file = await githubApi.getRepositoryFile(
        selectedRepository.fullName.split('/')[0], selectedRepository.name,
        repositoryPath.trim(), selectedBranch,
      )
      setRepositoryFile(file)
      const imported = await workspace?.importFile?.(file.path, file.content)
      setOperationMessage(imported
        ? `Pulled ${file.path} from ${selectedBranch} into the selected project.`
        : `Loaded ${file.path} from ${selectedBranch}; workspace import was not completed.`)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Repository file could not be loaded.')
    } finally {
      setBusy(false)
    }
  }

  const commitWorkspaceFile = async () => {
    if (!selectedRepository || !selectedBranch || !workspace?.activeFile?.path || !workspace.projectAvailable) return
    const message = window.prompt('Commit message for the selected workspace file:')
    if (!message?.trim()) return
    setBusy(true)
    setError('')
    try {
      const result = await githubApi.commitRepositoryFile(
        selectedRepository.fullName.split('/')[0], selectedRepository.name,
        {
          path: workspace.activeFile.path,
          content: workspace.content,
          message,
          branch: selectedBranch,
          ...(repositoryFile?.path === workspace.activeFile.path ? { sha: repositoryFile.sha } : {}),
        },
      )
      setOperationMessage(`Committed ${result.path} as ${result.commitSha.slice(0, 7)}.`)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'GitHub commit failed.')
    } finally {
      setBusy(false)
    }
  }

  const disconnectGitHub = async () => {
    if (!window.confirm('Disconnect GitHub and remove the stored access token?')) return
    setBusy(true)
    setError('')
    try {
      const result = await githubApi.disconnect()
      setConnection({ available: true, connected: false })
      setRepositories([])
      setSelectedRepository(null)
      setOperationMessage(result.revoked
        ? 'GitHub token revoked and local connection removed.'
        : 'Local connection removed. GitHub could not confirm remote token revocation; revoke it in GitHub settings.')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'GitHub disconnect failed.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="github-content">
    {loading
      ? <div className="workspace-empty-state"><span className="empty-state-icon"><Github size={22} /></span><h3>Checking GitHub connection</h3><p>Reading connection status from the authenticated backend.</p></div>
      : error
        ? <div className="workspace-empty-state" role="alert"><span className="empty-state-icon"><Github size={22} /></span><h3>GitHub status unavailable</h3><p>{error}</p><button className="button-outline" type="button" onClick={refresh} disabled={busy}><RefreshCw size={14} /> Retry</button></div>
        : !connection?.available
          ? <div className="workspace-empty-state"><span className="empty-state-icon"><Github size={22} /></span><h3>GitHub integration unavailable</h3><p>Required server-side OAuth, dashboard return, and token-encryption configuration is not available. No connection was attempted.</p></div>
          : !connection.connected
                ? <div className="workspace-empty-state"><span className="empty-state-icon"><Github size={22} /></span><h3>Connect a GitHub account</h3><p>Authorization and repository access use the configured server-side integration.</p>{callbackNotice && <p role="status">{callbackNotice}</p>}<button className="button-outline" type="button" onClick={connectGitHub} disabled={busy}>{busy ? 'Starting authorization…' : 'Connect GitHub'}</button></div>
            : <div className="github-repository-list">
                  <div className="github-repository-toolbar"><p>Connected account · repository operations use your GitHub permissions</p><div><button className="button-outline" type="button" onClick={refresh} disabled={busy}><RefreshCw size={14} /> Refresh</button><button className="button-outline" type="button" onClick={disconnectGitHub} disabled={busy}>Disconnect</button></div></div>
                {repositories.length === 0
                  ? <div className="workspace-empty-state"><span className="empty-state-icon"><Github size={22} /></span><h3>No repositories returned</h3><p>The authenticated GitHub API returned no repositories for this account.</p></div>
                  : repositories.map((repository) => <div className="github-repository" key={repository.id}>
                      <a href={repository.htmlUrl} target="_blank" rel="noreferrer noopener"><span><strong>{repository.fullName}</strong><small>{repository.private ? 'Private' : 'Public'} · {repository.defaultBranch || 'No default branch'}</small></span><ExternalLink size={14} aria-hidden="true" /></a>
                      <button className="button-outline" type="button" disabled={busy} onClick={() => loadBranches(repository)}><GitBranch size={14} /> Branches</button>
                    </div>)}
                {selectedRepository && <section className="github-repository-operations" aria-label="Repository operations">
                  <h3>{selectedRepository.fullName}</h3>
                  <label>Branch<select value={selectedBranch} onChange={(event) => setSelectedBranch(event.target.value)} disabled={busy}><option value="">Select branch</option>{branches.map((branch) => <option key={branch.name} value={branch.name}>{branch.name}</option>)}</select></label>
                  <label>Repository file path<input value={repositoryPath} onChange={(event) => setRepositoryPath(event.target.value)} maxLength={512} /></label>
                  <div className="github-repository-actions"><button className="button-outline" type="button" onClick={pullRepositoryFile} disabled={busy || !selectedBranch || !workspace?.projectAvailable}><Download size={14} /> Pull into workspace</button><button className="button-outline" type="button" onClick={commitWorkspaceFile} disabled={busy || !selectedBranch || !workspace?.activeFile || !workspace.projectAvailable}><Upload size={14} /> Commit workspace file</button></div>
                  {operationMessage && <p role="status">{operationMessage}</p>}
                  {repositoryFile && <pre className="github-file-preview"><code>{repositoryFile.content}</code></pre>}
                </section>}
                {error && <p role="alert">{error}</p>}
              </div>}
  </div>
}
