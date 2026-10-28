import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import AutomationHub from './AutomationHub.jsx'
import AICommandCenter from './AICommandCenter.jsx'
import ThreatIntelligencePage from './threat-intelligence/ThreatIntelligencePage.jsx'
import SecurityTestingLabPage from './security-testing-lab/SecurityTestingLabPage.jsx'
import IdentityNetworkSecurityPage from './identity-network-security/IdentityNetworkSecurityPage.jsx'
import InvestigationCenterPage from './investigation-center/InvestigationCenterPage.jsx'
import AIDefenseResponsePage from './ai-defense-response/AIDefenseResponsePage.jsx'
import SectionPlaceholder from './SectionPlaceholder.jsx'
import VoiceCommander from './VoiceCommander.jsx'
import SecurityMonitor from './SecurityMonitor.jsx'
import GitHubPanel from './GitHubPanel.jsx'
import { useWorkspaceFiles } from './useWorkspaceFiles.js'
import { terminalApi } from './terminalService.js'
import { previewApi } from './previewService.js'
import CodeEditor from './CodeEditor.jsx'
import { detectLanguage } from './codeHighlight.js'
import { classifyTerminalLine, splitTerminalPaths } from './terminalOutput.js'
import {
  Bell, Check, ChevronDown, ChevronRight, CircleHelp, Code2, Crown, Download,
  FileCode2, FilePlus2, Folder, FolderOpen, Github, House,
  LayoutDashboard, LogOut, Maximize2, Menu, Network, PanelLeftClose, PanelLeftOpen,
  Radio, RefreshCw, Search, Settings, Shield, ShieldAlert, ShieldCheck, Sparkles, Upload,
  Terminal, UserRound, X,
} from 'lucide-react'

const navItems = [
  { title: 'Main Dashboard', subtitle: 'Command Center', icon: House, id: 'main' },
  { title: 'AI Command Center', subtitle: 'AI Assistant & Agents', icon: Sparkles, color: 'cyan', id: 'ai' },
  { title: 'Automation Hub', subtitle: 'Intelligent Automation', icon: Network, color: 'cyan', id: 'automation' },
  { title: 'Threat Intelligence', subtitle: 'Detection & Fraud', icon: ShieldAlert, color: 'red', id: 'threat' },
  { title: 'Security Testing Lab', subtitle: 'Secure Apps & Vulnerabilities', icon: ShieldCheck, color: 'blue', id: 'security' },
  { title: 'Identity & Network', subtitle: 'Access, Zero Trust & Privacy', icon: Radio, color: 'cyan', id: 'identity' },
  { title: 'Investigation Center', subtitle: 'Digital Forensics & Analytics', icon: Search, color: 'blue', id: 'investigation' },
  { title: 'AI Defense & Response', subtitle: 'Guardrails & Incident Response', icon: Shield, color: 'red', id: 'defense' },
  { title: 'Developer Dashboard', subtitle: 'Coding Workspace', icon: Code2, color: 'cyan', id: 'developer' },
]

const tools = [
  { title: 'Code Editor', caption: 'Open the code editor', icon: Code2, color: 'cyan', target: 'editor' },
  { title: 'Project Builder', caption: 'Open the project explorer', icon: Folder, color: 'sky', target: 'explorer' },
  { title: 'Terminal', caption: 'Open the workspace terminal', icon: Terminal, color: 'pink', target: 'terminal' },
  { title: 'Live Preview', caption: 'Open preview when available', icon: LayoutDashboard, color: 'blue', target: 'preview' },
  { title: 'GitHub Integration', caption: 'Open repository integration', icon: Github, color: 'white', target: 'github' },
  { title: 'View', caption: 'Switch to VS Code workspace', icon: Maximize2, color: 'blue', target: 'vscode' },
]

function IconButton({ label, children, onClick, disabled = false }) {
  return <button className="icon-button" aria-label={label} title={label} onClick={onClick} disabled={disabled}>{children}</button>
}

function ResizeHandle({ orientation, onResize, label, style }) {
  const handlePointerDown = (event) => {
    event.preventDefault()
    let previous = orientation === 'vertical' ? event.clientX : event.clientY
    const move = (moveEvent) => {
      const current = orientation === 'vertical' ? moveEvent.clientX : moveEvent.clientY
      onResize(orientation === 'vertical' ? current - previous : previous - current)
      previous = current
    }
    const finish = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      document.body.classList.remove('is-resizing-dashboard')
    }
    document.body.classList.add('is-resizing-dashboard')
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish, { once: true })
    window.addEventListener('pointercancel', finish, { once: true })
  }

  return <button style={style} className={`workspace-resizer ${orientation}`} role="separator" aria-orientation={orientation} aria-label={label} onPointerDown={handlePointerDown} />
}

function EmptyState({ icon: Icon, title, detail, action }) {
  return <div className="workspace-empty-state"><span className="empty-state-icon"><Icon size={22} /></span><h3>{title}</h3><p>{detail}</p>{action && <span className="empty-state-action">{action}</span>}</div>
}

function WorkspaceTree({ nodes, activePath, onOpen, depth = 0 }) {
  return nodes.map((node) => node.type === 'directory'
    ? <div key={node.path}>
        <div className="workspace-file-row" style={{ paddingLeft: 10 + depth * 14, display: 'flex', alignItems: 'center', gap: 7, minHeight: 29, color: '#9aafc0' }}>
          <ChevronRight size={13} /><FolderOpen size={14} /><span>{node.name}</span>
        </div>
        <WorkspaceTree nodes={node.children} activePath={activePath} onOpen={onOpen} depth={depth + 1} />
      </div>
    : <button
        type="button"
        key={node.path}
        className="workspace-file-row"
        aria-current={activePath === node.path ? 'page' : undefined}
        onClick={() => onOpen(node.path)}
        style={{
          width: '100%',
          padding: `6px 8px 6px ${10 + depth * 14}px`,
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          textAlign: 'left',
          color: activePath === node.path ? '#13d9f5' : '#c3d3df',
          background: activePath === node.path ? 'rgba(19,217,245,.08)' : 'transparent',
          border: 0,
          cursor: 'pointer',
        }}
      >
        <FileCode2 size={14} /><span>{node.name}</span>
      </button>)
}

function DeveloperWorkspace({ openPanels, activeSidePanel, onNotify, onClosePanel, projects, projectsLoading, projectsError, workspace }) {
  const [explorerWidth, setExplorerWidth] = useState(252)
  const [sideWidth, setSideWidth] = useState(350)
  const [terminalHeight, setTerminalHeight] = useState(205)
  const uploadInputRef = useRef(null)
  const [terminalCommand, setTerminalCommand] = useState('')
  const [terminalJobRecord, setTerminalJobRecord] = useState({ projectId: workspace.projectId, job: null })
  const [terminalStateRecord, setTerminalStateRecord] = useState({
    projectId: workspace.projectId,
    state: {
      kind: 'info',
      message: 'Enter a supported command or run a project test/build.',
    },
  })
  const [terminalLoadingRecord, setTerminalLoadingRecord] = useState({ projectId: workspace.projectId, loading: false })
  const [previewRecord, setPreviewRecord] = useState({
    projectId: workspace.projectId,
    session: null,
    message: 'No preview session is running.',
    kind: 'idle',
    loading: false,
  })
  const terminalJob = terminalJobRecord.projectId === workspace.projectId ? terminalJobRecord.job : null
  const terminalState = terminalStateRecord.projectId === workspace.projectId
    ? terminalStateRecord.state
    : { kind: 'info', message: 'Enter a supported command or run a project test/build.' }
  const terminalLoading = terminalLoadingRecord.projectId === workspace.projectId && terminalLoadingRecord.loading
  const previewState = previewRecord.projectId === workspace.projectId
    ? previewRecord
    : { session: null, message: 'No preview session is running.', kind: 'idle', loading: false }
  const terminalRequestId = useRef(0)
  const terminalSubmitInFlight = useRef(false)
  const previewRequestId = useRef(0)
  const terminalProjectId = useRef(workspace.projectId)
  terminalProjectId.current = workspace.projectId
  const setTerminalJob = (job) => setTerminalJobRecord({ projectId: terminalProjectId.current, job })
  const setTerminalState = (state) => setTerminalStateRecord({ projectId: terminalProjectId.current, state })
  const setTerminalLoading = (loading) => setTerminalLoadingRecord({ projectId: terminalProjectId.current, loading })
  const setPreviewState = (next) => setPreviewRecord({ projectId: terminalProjectId.current, ...next })
  useLayoutEffect(() => {
    terminalRequestId.current += 1
    terminalSubmitInFlight.current = false
    previewRequestId.current += 1
    setTerminalJob(null)
    setTerminalLoading(false)
    setTerminalState({
      kind: 'info',
      message: 'Enter a supported command or run a project test/build.',
    })
  }, [workspace.projectId])
  useEffect(() => {
    if (
      !terminalJob?.jobId ||
      !['queued', 'running'].includes(terminalJob.status) ||
      terminalLoading
    ) return undefined

    const requestedProjectId = workspace.projectId
    const requestId = ++terminalRequestId.current
    let cancelled = false
    let timer

    const poll = async () => {
      try {
        const job = await terminalApi.getStatus(requestedProjectId, terminalJob.jobId)
        if (cancelled || requestId !== terminalRequestId.current || terminalProjectId.current !== requestedProjectId) return
        setTerminalJob({ ...job, command: terminalJob.command })
        const failed = ['failed', 'timed_out'].includes(job.status)
        setTerminalState({
          kind: failed ? 'error' : 'success',
          message: `Job status: ${job.status}${typeof job.exitCode === 'number' ? ` (exit code ${job.exitCode})` : ''}.`,
        })
        if (['queued', 'running'].includes(job.status)) timer = window.setTimeout(poll, 1500)
      } catch (error) {
        if (cancelled || requestId !== terminalRequestId.current || terminalProjectId.current !== requestedProjectId) return
        setTerminalState({ kind: 'error', message: error instanceof Error ? error.message : 'Terminal job status could not be loaded.' })
      }
    }

    timer = window.setTimeout(poll, 1000)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [terminalJob?.jobId, terminalJob?.status, terminalLoading, workspace.projectId])
  useEffect(() => {
    const session = previewState.session
    if (!session?.sessionId || session.status !== 'starting' || previewState.loading) return undefined

    const requestedProjectId = workspace.projectId
    const requestId = ++previewRequestId.current
    let cancelled = false
    let timer

    const poll = async () => {
      try {
        const updated = await previewApi.getStatus(requestedProjectId, session.sessionId)
        if (cancelled || requestId !== previewRequestId.current || terminalProjectId.current !== requestedProjectId) return
        const message = updated.stderr
          ? `Preview state: ${updated.status}. ${updated.stderr}`
          : `Preview state: ${updated.status}.`
        setPreviewState({
          session: updated,
          message,
          kind: updated.status === 'failed' ? 'error' : 'success',
          loading: false,
        })
        if (updated.status === 'starting') timer = window.setTimeout(poll, 1500)
      } catch (error) {
        if (cancelled || requestId !== previewRequestId.current || terminalProjectId.current !== requestedProjectId) return
        setPreviewState({
          ...previewState,
          message: error instanceof Error ? error.message : 'Preview status could not be loaded.',
          kind: 'error',
          loading: false,
        })
      }
    }

    timer = window.setTimeout(poll, 1000)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [previewState.loading, previewState.session?.sessionId, previewState.session?.status, workspace.projectId])
  const showExplorer = openPanels.has('explorer')
  const showEditor = openPanels.has('editor')
  const showTerminal = openPanels.has('terminal')
  const showSidePanel = Boolean(activeSidePanel)
  const showProjectBuilderBesideEditor = showEditor && showExplorer
  const centerColumn = showExplorer ? 3 : 1
  const sideColumn = (showExplorer ? 3 : 1) + 2
  const hasUpperPane = showEditor

  const columns = showProjectBuilderBesideEditor
    ? `${explorerWidth}px 5px minmax(0, 1fr)`
    : [
        ...(showExplorer ? [`${explorerWidth}px`, '5px'] : []),
        'minmax(0, 1fr)',
        ...(showSidePanel ? ['5px', `${sideWidth}px`] : []),
      ].join(' ')
  const rows = showProjectBuilderBesideEditor
    ? 'max(68vh, 620px)'
    : hasUpperPane && showTerminal ? `minmax(150px, 1fr) 5px ${terminalHeight}px` : 'minmax(0, 1fr)'
  const openFile = (path) => workspace.openFile(path)
  const createFile = () => {
    const path = window.prompt('Enter a workspace-relative file path (for example: src/App.jsx):')
    if (path) workspace.createFile(path)
  }
  const renameFile = () => {
    if (!workspace.activeFile) return
    const path = window.prompt('Enter the new workspace-relative path:', workspace.activeFile.path)
    if (path) workspace.renameFile(path)
  }
  const uploadFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const path = file.webkitRelativePath || file.name
    const existing = workspace.fileList.projectId === workspace.projectId
      && workspace.fileList.files.some((entry) => entry.path === path)
    if (existing && !window.confirm(`Replace ${path} in this project?`)) return

    try {
      const imported = await workspace.importFile(path, await file.text())
      onNotify?.(imported ? `Uploaded ${path} to the project.` : `Upload of ${path} was not completed; check the project and editor status.`)
    } catch (error) {
      onNotify?.(error instanceof Error ? error.message : 'The selected file could not be read.')
    }
  }
  const submitTerminalTask = async (taskType = 'project_test', command = '') => {
    if (!workspace.projectAvailable || terminalLoading || terminalSubmitInFlight.current) return
    const submittedCommand = command.trim()
    if (command && !submittedCommand) return

    terminalSubmitInFlight.current = true
    const requestId = ++terminalRequestId.current
    const requestedProjectId = workspace.projectId
    setTerminalLoading(true)
    setTerminalState({ kind: 'loading', message: 'Checking terminal availability…' })

    try {
      const job = submittedCommand
        ? await terminalApi.submitCommand(requestedProjectId, submittedCommand)
        : await terminalApi.submit(requestedProjectId, taskType)
      if (requestId === terminalRequestId.current && terminalProjectId.current === requestedProjectId) {
        setTerminalJob({
          ...job,
          command: submittedCommand || (taskType === 'project_build' ? 'npm run build' : 'npm test'),
        })
        if (submittedCommand) setTerminalCommand('')
        setTerminalState({ kind: 'success', message: `Job accepted with status: ${job.status}.` })
      }
    } catch (error) {
      if (requestId !== terminalRequestId.current || terminalProjectId.current !== requestedProjectId) return
      const isUnavailable = /→ 503:/.test(error.message)
      setTerminalState({
        kind: isUnavailable ? 'unavailable' : 'error',
        message: error.message,
      })
    } finally {
      if (requestId === terminalRequestId.current && terminalProjectId.current === requestedProjectId) {
        terminalSubmitInFlight.current = false
        setTerminalLoading(false)
      }
    }
  }
  const submitTerminalCommand = (event) => {
    event.preventDefault()
    if (terminalLoading || terminalSubmitInFlight.current || (terminalJob && ['queued', 'running'].includes(terminalJob.status))) return
    void submitTerminalTask('', terminalCommand)
  }
  const updateTerminalJob = async (action) => {
    if (!workspace.projectAvailable || !terminalJob?.jobId || terminalLoading) return
    const requestId = ++terminalRequestId.current
    const requestedProjectId = workspace.projectId
    setTerminalLoading(true)
    setTerminalState({ kind: 'loading', message: action === 'cancel' ? 'Requesting job cancellation…' : 'Checking job status…' })

    try {
      const job = action === 'cancel'
        ? await terminalApi.cancel(requestedProjectId, terminalJob.jobId).then(
          () => terminalApi.getStatus(requestedProjectId, terminalJob.jobId)
        )
        : await terminalApi.getStatus(requestedProjectId, terminalJob.jobId)
      if (requestId === terminalRequestId.current && terminalProjectId.current === requestedProjectId) {
        setTerminalJob({ ...job, command: terminalJob.command })
        const failed = ['failed', 'timed_out'].includes(job.status)
        setTerminalState({
          kind: failed ? 'error' : 'success',
          message: `Job status: ${job.status}${typeof job.exitCode === 'number' ? ` (exit code ${job.exitCode})` : ''}.`,
        })
      }
    } catch (error) {
      if (requestId !== terminalRequestId.current || terminalProjectId.current !== requestedProjectId) return
      const isUnavailable = /→ 503:/.test(error.message)
      setTerminalState({
        kind: isUnavailable ? 'unavailable' : 'error',
        message: error.message,
      })
    } finally {
      if (requestId === terminalRequestId.current && terminalProjectId.current === requestedProjectId) {
        setTerminalLoading(false)
      }
    }
  }
  const startPreview = async () => {
    if (
      !workspace.projectAvailable ||
      previewState.loading ||
      (previewState.session && ['starting', 'ready'].includes(previewState.session.status))
    ) return
    const entry = workspace.fileList.projectId === workspace.projectId
      ? workspace.fileList.files.find((file) => /\.html?$/i.test(file.path))
      : null
    if (!entry) {
      setPreviewState({ session: null, message: 'Add an HTML entry file to this project before requesting a preview.', kind: 'error', loading: false })
      return
    }
    const requestId = ++previewRequestId.current
    const requestedProjectId = workspace.projectId
    setPreviewState({ ...previewState, message: 'Requesting isolated preview startup…', kind: 'loading', loading: true })
    try {
      const session = await previewApi.start(requestedProjectId, { projectType: 'vite_react', entryPath: entry.path })
      if (requestId !== previewRequestId.current || terminalProjectId.current !== requestedProjectId) return
      setPreviewState({ session, message: `Preview state: ${session.status}.`, kind: 'success', loading: false })
    } catch (error) {
      if (requestId !== previewRequestId.current || terminalProjectId.current !== requestedProjectId) return
      setPreviewState({ session: null, message: error instanceof Error ? error.message : 'Preview service is unavailable.', kind: /→ 503:/.test(error?.message || '') ? 'unavailable' : 'error', loading: false })
    }
  }
  const refreshPreview = async () => {
    if (!previewState.session?.sessionId || previewState.loading) return
    const requestId = ++previewRequestId.current
    const requestedProjectId = workspace.projectId
    setPreviewState({ ...previewState, message: 'Checking preview service status…', kind: 'loading', loading: true })
    try {
      const session = await previewApi.getStatus(requestedProjectId, previewState.session.sessionId)
      if (requestId !== previewRequestId.current || terminalProjectId.current !== requestedProjectId) return
      setPreviewState({ session, message: `Preview state: ${session.status}.`, kind: 'success', loading: false })
    } catch (error) {
      if (requestId !== previewRequestId.current || terminalProjectId.current !== requestedProjectId) return
      setPreviewState({ ...previewState, message: error instanceof Error ? error.message : 'Preview status could not be loaded.', kind: 'error', loading: false })
    }
  }
  const stopPreview = async () => {
    if (!previewState.session?.sessionId || previewState.loading) return
    const requestId = ++previewRequestId.current
    const requestedProjectId = workspace.projectId
    setPreviewState({ ...previewState, message: 'Stopping preview session…', kind: 'loading', loading: true })
    try {
      const session = await previewApi.stop(requestedProjectId, previewState.session.sessionId)
      if (requestId !== previewRequestId.current || terminalProjectId.current !== requestedProjectId) return
      setPreviewState({ session, message: `Preview state: ${session.status}.`, kind: 'success', loading: false })
    } catch (error) {
      if (requestId !== previewRequestId.current || terminalProjectId.current !== requestedProjectId) return
      setPreviewState({ ...previewState, message: error instanceof Error ? error.message : 'Preview session could not be stopped.', kind: 'error', loading: false })
    }
  }

  if (!showExplorer && !showEditor && !showTerminal && !showSidePanel) {
    return <div className="developer-workspace empty-workspace"><div><span className="workspace-empty-mark"><Code2 size={24} /></span><b>Choose a tool to open your workspace</b><small>Your editor, project explorer, terminal, preview, and integrations open only when selected above.</small></div></div>
  }

  return <div className={`developer-workspace ${showEditor ? 'editor-expanded' : ''} ${showProjectBuilderBesideEditor ? 'project-builder-open' : ''}`} style={{ gridTemplateColumns: columns, gridTemplateRows: rows }}>
    {showExplorer && <section className="panel explorer-panel resizable-panel" style={{ gridColumn: 1, gridRow: '1 / -1' }}>
      <header className="panel-header"><div className="panel-heading"><Folder size={17} className="cyan" /><h2>Project Explorer</h2></div><div className="panel-actions"><IconButton label="Export source archive" disabled={!workspace.projectAvailable || Boolean(workspace.busyAction)} onClick={workspace.exportSource}><Download size={15} /></IconButton><IconButton label="Upload file to project" disabled={!workspace.projectAvailable || Boolean(workspace.busyAction)} onClick={() => uploadInputRef.current?.click()}><Upload size={15} /></IconButton><input ref={uploadInputRef} type="file" aria-label="Select a file to upload to the project" onChange={uploadFile} style={{ display: 'none' }} /><IconButton label="New file" disabled={!workspace.projectAvailable || Boolean(workspace.busyAction)} onClick={createFile}><FilePlus2 size={15} /></IconButton><IconButton label="Refresh project files" disabled={!workspace.projectAvailable || Boolean(workspace.busyAction)} onClick={() => workspace.refreshFiles()}><RefreshCw size={15} /></IconButton><IconButton label="Close project explorer" onClick={() => onClosePanel('explorer')}><X size={15} /></IconButton></div></header>
      <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(25,83,112,.55)' }}>
        <label htmlFor="workspace-project-select" style={{ display: 'block', marginBottom: 5, color: '#9aafc0', fontSize: 11 }}>Project</label>
        <select
          id="workspace-project-select"
          aria-label="Select workspace project"
          value={workspace.projectId}
          disabled={projectsLoading || Boolean(workspace.busyAction)}
          onChange={(event) => workspace.selectProject(event.target.value)}
          style={{ width: '100%', padding: '7px 8px', color: '#e7f3fc', background: '#06141d', border: '1px solid #123348', borderRadius: 5 }}
        >
          {!workspace.projectId && <option value="">{projectsLoading ? 'Loading projects…' : 'Select a project'}</option>}
          {workspace.projectId && !workspace.projectAvailable && <option value={workspace.projectId}>Project unavailable (draft preserved)</option>}
          {projects.map((project) => <option key={project._id} value={project._id}>{project.title}</option>)}
        </select>
      </div>
      <div className="tree-scroll" aria-live="polite">
        {workspace.status && <div role={workspace.status.kind === 'error' ? 'alert' : 'status'} style={{ padding: '7px 10px', color: workspace.status.kind === 'error' ? '#ff858b' : '#13d9a5' }}>{workspace.status.message}</div>}
        {projectsError
          ? <EmptyState icon={FolderOpen} title="Projects unavailable" detail={projectsError} />
          : projectsLoading && projects.length === 0
            ? <EmptyState icon={FolderOpen} title="Loading projects" detail="Retrieving your projects…" />
            : projects.length === 0
              ? <EmptyState icon={FolderOpen} title="No projects available" detail="Create a project before adding workspace files." />
              : !workspace.projectId
                ? <EmptyState icon={FolderOpen} title="Select a project" detail="Choose a project to load its workspace files." />
                : !workspace.projectAvailable
                  ? <EmptyState icon={FolderOpen} title="Project unavailable" detail="This project is no longer available. Your open draft is preserved; select another project to continue." />
                : workspace.fileList.projectId !== workspace.projectId || workspace.fileList.loading
                  ? <EmptyState icon={FolderOpen} title="Loading files" detail="Loading the selected project's workspace…" />
                  : workspace.fileList.error
                    ? <EmptyState icon={FolderOpen} title="Could not load files" detail={workspace.fileList.error} action={<button type="button" className="button-outline" onClick={() => workspace.refreshFiles()}>Retry</button>} />
                    : workspace.fileList.tree.length === 0
                      ? <EmptyState icon={FolderOpen} title="No files in this project" detail="Create a file to get started." />
                      : <WorkspaceTree nodes={workspace.fileList.tree} activePath={workspace.activeFile?.path} onOpen={openFile} />}
      </div>
      <footer className="explorer-footer"><span>Workspace files</span><span>{workspace.fileList.projectId === workspace.projectId ? `${workspace.fileList.files.length} files` : '—'}</span></footer>
    </section>}
    {showExplorer && <ResizeHandle orientation="vertical" label="Resize project explorer" style={{ gridColumn: 2, gridRow: '1 / -1' }} onResize={(delta) => setExplorerWidth((width) => Math.max(180, Math.min(520, width + delta)))} />}

    {showEditor && <section className="panel editor-panel resizable-panel" style={{ gridColumn: centerColumn, gridRow: 1 }}>
      <header className="tabs-header"><div className="tabs"><span className="editor-tab current"><Code2 size={14} /><span>{workspace.activeFile?.path || 'Editor'}</span>{workspace.isDirty && <small aria-label="Unsaved changes">●</small>}</span></div><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><button type="button" className="button-outline" disabled={!workspace.activeFile || !workspace.projectAvailable || !workspace.isDirty || Boolean(workspace.busyAction)} onClick={workspace.saveFile}>{workspace.busyAction === 'Saving' ? 'Saving…' : 'Save'}</button><IconButton label="Rename selected file" disabled={!workspace.activeFile || !workspace.projectAvailable || Boolean(workspace.busyAction)} onClick={renameFile}><FileCode2 size={14} /></IconButton><IconButton label="Delete selected file" disabled={!workspace.activeFile || !workspace.projectAvailable || Boolean(workspace.busyAction)} onClick={workspace.deleteFile}><X size={15} /></IconButton><IconButton label="Close code editor" onClick={() => onClosePanel('editor')}><X size={15} /></IconButton></div></header>
      <div className="editor-toolbar"><span><span className="editor-status" /> {workspace.activeFile?.path || 'No file selected'}{!workspace.projectAvailable && workspace.projectId ? ' · Project unavailable' : ''}{workspace.isDirty ? ' · Unsaved changes' : ''}</span><div><span>UTF-8</span><span>{detectLanguage(workspace.activeFile?.path)}</span><IconButton label="Refresh editor files" disabled={!workspace.projectAvailable || Boolean(workspace.busyAction)} onClick={() => workspace.refreshFiles()}><RefreshCw size={13} /></IconButton></div></div>
      <div className="code-area" aria-live="polite">
        {workspace.status && <div role={workspace.status.kind === 'error' ? 'alert' : 'status'} style={{ padding: '7px 10px', color: workspace.status.kind === 'error' ? '#ff858b' : '#13d9a5' }}>{workspace.status.message}</div>}
        {workspace.fileError && <div role="alert" style={{ padding: '7px 10px', color: '#ff858b' }}>{workspace.fileError}</div>}
        {workspace.fileLoading
          ? <EmptyState icon={FileCode2} title="Opening file" detail="Loading file contents…" />
          : workspace.activeFile
            ? <CodeEditor
                filePath={workspace.activeFile.path}
                value={workspace.content}
                disabled={Boolean(workspace.busyAction)}
                onChange={(event) => workspace.setContent(event.target.value)}
              />
            : <EmptyState icon={FileCode2} title="Open a project file to start editing" detail={workspace.projectId ? 'Choose a file from the project explorer.' : 'Select a project to load its workspace files.'} />}
      </div>
      <footer className="editor-footer"><span>{workspace.busyAction || (workspace.isDirty ? 'Unsaved' : 'Ready')}</span><span>UTF-8</span><span>{workspace.status?.kind === 'success' ? workspace.status.message : workspace.activeFile?.path || 'No file open'}</span></footer>
    </section>}

    {showEditor && showTerminal && <ResizeHandle orientation="horizontal" label="Resize terminal panel" onResize={(delta) => setTerminalHeight((height) => Math.max(120, Math.min(480, height + delta)))} style={{ gridColumn: centerColumn, gridRow: 2 }} />}
    {showTerminal && <section className="panel terminal-panel resizable-panel" style={{ gridColumn: centerColumn, gridRow: hasUpperPane ? 3 : 1 }}>
      <header className="panel-header"><div className="panel-heading"><Terminal size={17} className="cyan" /><h2>Terminal</h2></div><div className="panel-actions"><IconButton label="Close terminal" onClick={() => onClosePanel('terminal')}><X size={15} /></IconButton></div></header>
      <div className="terminal-content">
        <div className="terminal-session-banner"><span aria-hidden="true">›</span><div><strong>Secure workspace terminal</strong><small>Restricted project commands · sandbox network disabled</small></div></div>
        <div className="terminal-controls">
          <form className="terminal-command-form" onSubmit={submitTerminalCommand}>
            <input
              className="terminal-command-input"
              aria-label="Enter a supported project command"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck="false"
              maxLength={256}
              placeholder="pwd, ls, npm test, or npm run <script>"
              value={terminalCommand}
              disabled={!workspace.projectAvailable || terminalLoading || Boolean(terminalJob && ['queued', 'running'].includes(terminalJob.status))}
              onChange={(event) => setTerminalCommand(event.target.value)}
            />
            <button
              type="submit"
              className="button-outline"
              disabled={!workspace.projectAvailable || terminalLoading || Boolean(terminalJob && ['queued', 'running'].includes(terminalJob.status)) || !terminalCommand.trim()}
            >Run</button>
          </form>
          <button type="button" className="button-outline" disabled={!workspace.projectAvailable || terminalLoading || Boolean(terminalJob && ['queued', 'running'].includes(terminalJob.status))} onClick={() => submitTerminalTask('project_test')}>{terminalLoading && !terminalJob ? 'Checking…' : 'Run project tests'}</button>
          <button type="button" className="button-outline" disabled={!workspace.projectAvailable || terminalLoading || Boolean(terminalJob && ['queued', 'running'].includes(terminalJob.status))} onClick={() => submitTerminalTask('project_build')}>Build project</button>
          {terminalJob?.jobId && <button type="button" className="button-outline" disabled={!workspace.projectAvailable || terminalLoading} onClick={() => updateTerminalJob('status')}>Refresh status</button>}
          {terminalJob?.jobId && ['queued', 'running'].includes(terminalJob.status) && <button type="button" className="button-outline" disabled={!workspace.projectAvailable || terminalLoading} onClick={() => updateTerminalJob('cancel')}>Cancel job</button>}
        </div>
        <div className={`terminal-state ${terminalState.kind}`} role={terminalState.kind === 'error' ? 'alert' : 'status'} aria-live="polite">
          <span className="terminal-state-dot" aria-hidden="true" />{terminalState.message}
        </div>
        {terminalJob?.jobId && <div className="terminal-job"><span>JOB</span><code>{terminalJob.jobId}</code><span>Command: {terminalJob.command}</span><b className={`job-${terminalJob.status}`}>{terminalJob.status}</b>{typeof terminalJob.exitCode === 'number' && <span>Exit code: {terminalJob.exitCode}</span>}</div>}
        {terminalJob?.stdout && <TerminalOutput text={terminalJob.stdout} stream="stdout" />}
        {terminalJob?.stderr && <TerminalOutput text={terminalJob.stderr} stream="stderr" />}
        <p className="terminal-safety-note">Supported commands run in an isolated, network-disabled project workspace; this is not a general shell. Returned output is untrusted text.</p>
      </div>
      <footer className="terminal-footer"><span>Terminal</span><span>{terminalLoading ? 'Checking availability' : terminalState.kind === 'error' ? 'Error' : terminalJob?.status || (terminalState.kind === 'unavailable' ? 'Unavailable' : 'Ready')}</span><span>{terminalJob ? 'Broker job' : 'No command execution'}</span></footer>
    </section>}

    {showSidePanel && <ResizeHandle orientation="vertical" label="Resize side panel" style={{ gridColumn: sideColumn - 1, gridRow: '1 / -1' }} onResize={(delta) => setSideWidth((width) => Math.max(240, Math.min(620, width - delta)))} />}
    {showSidePanel && activeSidePanel === 'preview' && <section className="panel preview-panel resizable-panel" style={{ gridColumn: sideColumn, gridRow: '1 / -1' }}>
      <header className="panel-header"><div className="panel-heading"><span className="workspace-status-dot" /><h2>Live Preview</h2></div><div className="panel-actions"><IconButton label="Close live preview" onClick={() => onClosePanel('preview')}><X size={15} /></IconButton></div></header>
      <div className="preview-controls">
        <button type="button" className="button-outline" disabled={!workspace.projectAvailable || previewState.loading || Boolean(previewState.session && ['starting', 'ready'].includes(previewState.session.status))} onClick={startPreview}>{previewState.loading && !previewState.session ? 'Starting…' : 'Start preview'}</button>
        {previewState.session?.sessionId && <button type="button" className="button-outline" disabled={previewState.loading} onClick={refreshPreview}><RefreshCw size={14} /> Check status</button>}
        {previewState.session?.sessionId && !['stopped', 'expired', 'failed'].includes(previewState.session.status) && <button type="button" className="button-outline" disabled={previewState.loading} onClick={stopPreview}>Stop</button>}
      </div>
      <div className="browser-window preview-empty" role={previewState.kind === 'error' ? 'alert' : 'status'} aria-live="polite">
        {previewState.session?.status === 'ready' && previewState.session.previewUrl
          ? <iframe title="Project live preview" src={previewState.session.previewUrl} sandbox="allow-scripts" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', border: 0 }} />
          : <EmptyState icon={LayoutDashboard} title={previewState.kind === 'unavailable' ? 'Preview service unavailable' : `Preview ${previewState.session?.status || 'not started'}`} detail={previewState.message} />}
      </div>
    </section>}

    {showSidePanel && activeSidePanel === 'github' && <section className="panel github-panel resizable-panel" style={{ gridColumn: sideColumn, gridRow: '1 / -1' }}>
      <header className="panel-header"><div className="panel-heading"><Github size={17} /><h2>GitHub Integration</h2></div><div className="panel-actions"><IconButton label="Close GitHub integration" onClick={() => onClosePanel('github')}><X size={15} /></IconButton></div></header>
      <GitHubPanel workspace={workspace} />
    </section>}
  </div>
}

function TerminalOutput({ text, stream }) {
  return <pre className={`terminal-output ${stream}`} aria-label={`${stream} from approved terminal broker`}><code>
    {String(text).split('\n').map((line, index) => (
      <span className={`terminal-output-line ${classifyTerminalLine(line, stream)}`} key={index}>
        {splitTerminalPaths(line).map((part, partIndex) => part.type === 'path'
          ? <span className="terminal-path" key={partIndex}>{part.value}</span>
          : <span key={partIndex}>{part.value}</span>)}
      </span>
    ))}
  </code></pre>
}

/**
 * New Cyber-Shield shell (sidebar, topbar, responsive layout) from all-dashboards.
 * Renders existing feature views through `renderMain` / section props without duplicating auth.
 */
export default function DashboardShell({
  activeDashboard,
  onSelectDashboard,
  search,
  onSearchChange,
  searchResults = [],
  onSearchSelect,
  notificationsOpen,
  onToggleNotifications,
  notice,
  onMarkNotificationsRead,
  accountOpen,
  onToggleAccount,
  onLogout,
  onNavigateLegacy,
  onOpenModal,
  workflowVersion = 0,
  showToast,
  toast,
  onDismissToast,
  chat,
  chatText,
  setChatText,
  submitChat,
  chatLoading = false,
  chatSubmitting = false,
  chatError = '',
  assistantName = 'Kiara',
  clearChat,
  tasks = [],
  tasksLoading = false,
  tasksError = '',
  renderMain,
  renderLegacySection,
  token,
  projects = [],
  projectsLoading = false,
  projectsError = '',
}) {
  const [mobileMenu, setMobileMenu] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarWasCollapsed, setSidebarWasCollapsed] = useState(false)
  const [vscodeMode, setVscodeMode] = useState(false)
  const [heroVisible, setHeroVisible] = useState(true)
  const [openPanels, setOpenPanels] = useState(new Set())
  const [activeSidePanel, setActiveSidePanel] = useState(() => (
    ['connected', 'error'].includes(new URLSearchParams(window.location.search).get('github'))
      ? 'github'
      : null
  ))
  const workspace = useWorkspaceFiles({ projects, projectsLoading, token })

  const openTool = (target) => {
    if (target === 'vscode') {
      if (vscodeMode) {
        setVscodeMode(false)
        setSidebarCollapsed(sidebarWasCollapsed)
      } else {
        setSidebarWasCollapsed(sidebarCollapsed)
        setSidebarCollapsed(true)
        setVscodeMode(true)
        setOpenPanels(new Set(['editor', 'explorer']))
        setActiveSidePanel(null)
      }
      return
    }
    if (target === 'preview' || target === 'github') {
      setActiveSidePanel((current) => current === target ? null : target)
      return
    }
    setOpenPanels((current) => {
      const next = new Set(current)
      if (target === 'explorer') {
        if (next.has('explorer')) next.delete('explorer')
        else next.add('explorer')
        next.add('editor')
      } else if (next.has(target)) next.delete(target)
      else next.add(target)
      return next
    })
  }

  const closePanel = (target) => {
    if (target === 'preview' || target === 'github') {
      setActiveSidePanel((current) => current === target ? null : current)
      return
    }
    setOpenPanels((current) => { const next = new Set(current); next.delete(target); return next })
  }

  const activeTool = (tool) => tool.target === 'preview' || tool.target === 'github'
    ? activeSidePanel === tool.target
    : tool.target === 'vscode' ? vscodeMode : openPanels.has(tool.target)

  const selectDashboard = (dashboard) => {
    onSelectDashboard(dashboard)
    setMobileMenu(false)
    if (vscodeMode) {
      setVscodeMode(false)
      setSidebarCollapsed(sidebarWasCollapsed)
    }
  }

  const handleAiTool = (action) => {
    if (action === 'Create Report') onOpenModal?.('Create Report')
    else if (action === 'Notes & Tasks') onNavigateLegacy?.('Notes & Tasks')
  }

  const handleLogout = () => {
    if (!workspace.confirmDiscard()) return
    onLogout?.()
  }

  let mainContent = null
  if (activeDashboard === 'ai') {
    mainContent = <AICommandCenter
      showToast={showToast}
      chat={chat}
      chatText={chatText}
      setChatText={setChatText}
      submitChat={submitChat}
      assistantName={assistantName}
      chatLoading={chatLoading}
      chatSubmitting={chatSubmitting}
      chatError={chatError}
      clearChat={clearChat}
      tasks={tasks}
      tasksLoading={tasksLoading}
      tasksError={tasksError}
      onOpenTool={handleAiTool}
    />
  } else if (activeDashboard === 'automation') {
    mainContent = <AutomationHub showToast={showToast} workflowVersion={workflowVersion} onCreateWorkflow={() => onOpenModal?.('Automate')} />
  } else if (activeDashboard === 'main') {
    mainContent = <div className="legacy-dashboard">{renderMain?.()}</div>
  } else if (activeDashboard === 'threat') {
    mainContent = <ThreatIntelligencePage showToast={showToast} token={token} onOpenModal={onOpenModal} />
  } else if (activeDashboard === 'security') {
    mainContent = <SecurityTestingLabPage showToast={showToast} onOpenModal={onOpenModal} onNavigateLegacy={onNavigateLegacy} token={token} />
  } else if (activeDashboard === 'identity') {
    mainContent = <IdentityNetworkSecurityPage showToast={showToast} onNavigateLegacy={onNavigateLegacy} />
  } else if (activeDashboard === 'investigation') {
    mainContent = <InvestigationCenterPage showToast={showToast} onNavigateLegacy={onNavigateLegacy} />
  } else if (activeDashboard === 'defense') {
    mainContent = <AIDefenseResponsePage showToast={showToast} onNavigateLegacy={onNavigateLegacy} />
  } else if (activeDashboard === 'legacy') {
    mainContent = <div className="legacy-dashboard">{renderLegacySection?.()}</div>
  } else {
    mainContent = <>
      {!vscodeMode && (heroVisible ? <section className="hero developer-hero"><div className="hero-copy"><span className="eyebrow"><span className="workspace-status-dot" /> DEVELOPER WORKSPACE</span><h1>Developer Dashboard</h1><p>Code. Build. Test. Deploy. All in one workspace.</p></div><div className="hero-promise">Build secure.<br />Build smarter.<span className="hero-spark">✦</span></div><button className="hero-close" type="button" onClick={() => setHeroVisible(false)} aria-label="Hide dashboard banner" title="Hide banner for more editor space"><X size={16} /></button><div className="hero-bottom-line" /></section> : <div className="hero-restore-row"><button type="button" onClick={() => setHeroVisible(true)}>Show dashboard banner</button></div>)}
      {vscodeMode ? <nav className="vscode-toolbar" aria-label="VS Code workspace"><div><Code2 size={17} /><strong>VS Code Workspace</strong></div><div className="vscode-toolbar-actions"><button type="button" onClick={() => openTool('explorer')}><Folder size={14} />Project Builder</button><button type="button" onClick={() => openTool('terminal')}><Terminal size={14} />Terminal</button><button type="button" onClick={() => openTool('preview')}><LayoutDashboard size={14} />Preview</button><button type="button" onClick={() => openTool('github')}><Github size={14} />GitHub</button><button className="exit-vscode-button" type="button" onClick={() => openTool('vscode')}><X size={14} />Exit View</button></div></nav> : <section className="tool-grid" aria-label="Workspace tools">{tools.map(({ title, caption, icon: Icon, color, target }) => <button key={title} className={`tool-card ${color} ${activeTool({ target }) ? 'tool-active' : ''}`} aria-pressed={activeTool({ target })} onClick={() => openTool(target)}><span className="tool-icon"><Icon size={29} strokeWidth={1.9} /></span><span className="tool-copy"><b>{title}</b><small>{caption}</small></span><ChevronRight size={17} className="tool-chevron" /></button>)}</section>}
      <DeveloperWorkspace openPanels={openPanels} activeSidePanel={activeSidePanel} onNotify={showToast} onClosePanel={closePanel} projects={projects} projectsLoading={projectsLoading} projectsError={projectsError} workspace={workspace} />
<footer className="main-footer"><span>CYBER-SHIELD AI <span className="footer-sep">/</span> DEVELOPER WORKSPACE</span><span><span className="workspace-status-dot" /> SERVICE STATUS SHOWN IN EACH PANEL</span><span>WORKSPACE READY <Code2 size={12} /></span></footer>
    </>
  }

  return <div className={`app-shell new-shell ${vscodeMode ? 'vscode-mode' : ''}`}>
    <header className="topbar">
      <button className="mobile-menu-button" onClick={() => setMobileMenu((open) => !open)} aria-label="Toggle navigation"><Menu size={21} /></button>
      <div className="brand"><img src="/shared/cyber-shield-logo.png" alt="Cyber-Shield AI" /></div>
      <label className="global-search"><Search size={18} /><input value={search} onChange={onSearchChange} placeholder="Search scans, tasks, projects…" /><kbd>⌘ K</kbd>
        {searchResults.length > 0 && <div className="shell-search-results">{searchResults.map((x, i) => <button key={i} type="button" onClick={() => onSearchSelect?.(x)}><Search size={14} />{x.label}<span>{x.type}</span></button>)}</div>}
      </label>
      <div className="top-actions">
        <div className="notification-wrap">
          <IconButton label="Notifications" onClick={onToggleNotifications}><Bell size={19} />{notice ? <i className="notice-dot-inline" /> : null}</IconButton>
          {notificationsOpen && <div className="notification-popover"><strong>Notifications</strong><p>No notification service is connected.</p><small>Alerts will appear here when a notification source is configured.</small></div>}
        </div>
        <span className="top-divider" />
        <div className="profile-wrap">
          <button className="profile" type="button" onClick={onToggleAccount}><span className="avatar"><UserRound size={19} /></span><span className="profile-copy"><b>Account</b><small>Signed in</small></span><ChevronDown size={15} /></button>
          {accountOpen && <div className="account-popover">
            <button type="button" onClick={() => onNavigateLegacy?.('Profile')}>Profile</button>
            <button type="button" onClick={() => onNavigateLegacy?.('Settings')}>Settings</button>
            <button type="button" onClick={() => onNavigateLegacy?.('Projects & Files')}>Projects & Files</button>
            <button type="button" onClick={() => onNavigateLegacy?.('Notes & Tasks')}>Notes & Tasks</button>
            <button type="button" onClick={() => onNavigateLegacy?.('Reports')}>Reports</button>
            <button type="button" onClick={handleLogout}><LogOut size={15} />Logout</button>
          </div>}
        </div>
      </div>
    </header>

    <div className={`layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''} ${sidebarCollapsed ? 'sidebar-is-collapsed' : ''}`}>
        <div className="sidebar-scroll">
          <div className="sidebar-toggle-row">
            <button className="sidebar-toggle" type="button" onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
              <span>{sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</span>
              {!sidebarCollapsed && <small>Collapse sidebar</small>}
            </button>
          </div>
          <div className="nav-list">{navItems.map(({ title, subtitle, icon: Icon, color, id }) => {
            const active = activeDashboard === id
            return <button key={title} className={`nav-entry ${active ? 'selected' : ''}`} aria-current={active ? 'page' : undefined} onClick={() => selectDashboard(id)}>
              <Icon className={`nav-icon ${color || 'default'}`} size={25} strokeWidth={2.1} />
              <span className="nav-copy"><b>{title}</b><small>{subtitle}</small></span>
              {active && <ChevronRight size={17} className="nav-chevron" />}
            </button>
          })}</div>
          <div className="sidebar-bottom">
            <button className="nav-entry compact" type="button" onClick={() => onNavigateLegacy?.('Settings')}><Settings size={24} className="nav-icon settings-icon" /><span className="nav-copy"><b>Settings</b><small>Preferences & Config</small></span></button>
            <button className="nav-entry compact" type="button" onClick={() => onNavigateLegacy?.('Help & Support')}><CircleHelp size={24} className="nav-icon help-icon" /><span className="nav-copy"><b>Help & Support</b><small>Documentation</small></span></button>
            <button className="plan-card" type="button" onClick={() => showToast?.('Plan information uses your signed-in workspace')}><Crown size={23} fill="currentColor" /><span><b>Plan</b><small>Workspace</small></span><ChevronRight size={17} /></button>
          </div>
        </div>
      </aside>

      <main className="main-content">{mainContent}</main>
    </div>
    {toast && <div className="toast"><Check size={15} />{toast}<button onClick={onDismissToast} aria-label="Dismiss"><X size={14} /></button></div>}
    <VoiceCommander
      assistantName={assistantName}
      onNavigate={selectDashboard}
      onLegacyNavigate={onNavigateLegacy}
      onOpenModal={onOpenModal}
      onLogout={handleLogout}
    />
    <SecurityMonitor token={token} showToast={showToast} />
  </div>
}

export { navItems }
