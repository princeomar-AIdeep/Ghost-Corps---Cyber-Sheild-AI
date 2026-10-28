import { useEffect, useState } from 'react'
import { Activity, CalendarClock, CheckCircle2, CircleAlert, Clock3, FilePlus2, ListChecks, Plus, RefreshCw, Shield, Workflow, Zap } from 'lucide-react'
import { isApiConfigured } from '../lib/api.js'
import { automationApi } from './automationService.js'

const tabs = [
  { id: 'workflows', label: 'Workflows', icon: Workflow },
  { id: 'scheduled', label: 'Scheduled Tasks', icon: CalendarClock },
  { id: 'executions', label: 'Execution Logs', icon: Activity },
  { id: 'templates', label: 'Templates', icon: FilePlus2 },
]

const emptyCopy = {
  workflows: ['No workflows connected', 'Workflow definitions will appear here when the backend integration is configured.'],
  scheduled: ['No scheduled tasks connected', 'Schedules and their next run times will be supplied by the backend.'],
  executions: ['No execution history connected', 'Run status, timestamps, and logs will appear here when available.'],
  templates: ['No templates connected', 'Workflow templates will be loaded from the backend when its API is ready.'],
}

function EmptyState({ title, detail }) {
  return <div className="automation-empty-state"><span><CircleAlert size={20} /></span><strong>{title}</strong><p>{detail}</p></div>
}

/**
 * Automation Hub UI from all-dashboards.
 * Create Workflow opens the existing Automate modal when onCreateWorkflow is provided.
 */
export default function AutomationHub({ showToast = () => {}, onCreateWorkflow, workflowVersion = 0 }) {
  const [activeTab, setActiveTab] = useState('workflows')
  const [workflows, setWorkflows] = useState([])
  const [totalDrafts, setTotalDrafts] = useState(0)
  const [workflowsLoading, setWorkflowsLoading] = useState(true)
  const [workflowsError, setWorkflowsError] = useState('')
  const [refreshVersion, setRefreshVersion] = useState(0)
  const selectedTab = tabs.find((tab) => tab.id === activeTab) || tabs[0]
  const Icon = selectedTab.icon
  const backendStatus = workflowsError
    ? 'Workflow drafts unavailable · check backend connection'
    : isApiConfigured() ? 'Workflow draft API connected · scheduling and execution unavailable' : 'Using default API URL · workflow drafts require backend access'
  const [title, detail] = emptyCopy[activeTab]
  const requestIntegration = () => showToast('Connect the workflow API to enable this action')
  useEffect(() => {
    const controller = new AbortController()
    setWorkflowsLoading(true)
    setWorkflowsError('')
    automationApi.listWorkflows({ signal: controller.signal })
      .then((data) => {
        setWorkflows(Array.isArray(data?.workflows) ? data.workflows : [])
        setTotalDrafts(Number.isFinite(data?.totalDrafts) ? data.totalDrafts : 0)
      })
      .catch(() => {
        if (!controller.signal.aborted) setWorkflowsError('Saved workflow drafts could not be loaded.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setWorkflowsLoading(false)
      })
    return () => controller.abort()
  }, [workflowVersion, refreshVersion])
  const createWorkflow = () => {
    if (typeof onCreateWorkflow === 'function') onCreateWorkflow()
    else requestIntegration()
  }

  return <div className="automation-page">
    <section className="automation-hero">
      <div><span className="automation-kicker"><Shield size={13} /> AUTOMATION CONTROL</span><h1>Automation Hub</h1><p>Build, schedule, and manage intelligent automation workflows.</p></div>
      <div className="automation-hero-promise">“Automate today.<br />Stay secure tomorrow.”</div>
    </section>

    <nav className="automation-tabs" aria-label="Automation sections">
      {tabs.map(({ id, label, icon: TabIcon }) => <button key={id} type="button" className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id)}><TabIcon size={14} />{label}</button>)}
    </nav>

    <section className="automation-metrics" aria-label="Workflow metrics">
      {[
        { label: 'Total Workflows', icon: Workflow },
        { label: 'Active Workflows', icon: Zap },
        { label: 'Scheduled Tasks', icon: CalendarClock },
        { label: 'Successful Runs', icon: CheckCircle2 },
      ].map(({ label, icon: MetricIcon }) => {
        const value = label === 'Total Workflows' ? (workflowsLoading || workflowsError ? '—' : totalDrafts)
          : label === 'Active Workflows' || label === 'Scheduled Tasks' || label === 'Successful Runs' ? '—' : '—'
        const note = label === 'Total Workflows' ? (workflowsError || 'Saved drafts only')
          : label === 'Active Workflows' ? 'Not executable'
            : label === 'Scheduled Tasks' ? 'Scheduler unavailable'
              : 'No execution service'
        return <article className="automation-metric" key={label}><span className="metric-icon"><MetricIcon size={17} /></span><div><small>{label}</small><b>{value}</b><span className="metric-footnote">{note}</span></div></article>
      })}
    </section>

    <section className="automation-overview-grid">
      <div className="automation-left-column">
        <article className="automation-panel automation-create-card">
          <span className="create-workflow-icon"><Plus size={23} /></span><div className="create-workflow-copy"><span className="automation-kicker">WORKFLOW DESIGNER</span><h2>Create a workflow</h2><p>Build an automation with connected workflow services.</p><button className="automation-primary-button" type="button" onClick={createWorkflow}><Plus size={13} /> Create Workflow</button></div>
        </article>
        <article className="automation-panel template-panel">
          <header className="automation-panel-header"><div><FilePlus2 size={15} /><h2>Popular Templates</h2></div><button type="button" onClick={() => setActiveTab('templates')}>Browse <span>›</span></button></header>
          <EmptyState title="Templates not connected" detail="Connect the workflow API to load available templates." />
        </article>
      </div>
      <article className="automation-panel recent-panel">
        <header className="automation-panel-header"><div><ListChecks size={15} /><h2>{activeTab === 'workflows' ? 'Workflow Drafts' : selectedTab.label}</h2></div><button type="button" onClick={() => setActiveTab('executions')}>View all <span>›</span></button></header>
        {activeTab === 'workflows'
          ? workflowsLoading ? <EmptyState title="Loading workflow drafts" detail="Fetching your saved draft definitions." />
            : workflowsError ? <EmptyState title="Workflow drafts unavailable" detail={workflowsError} />
              : workflows.length ? <div className="automation-draft-list">{workflows.slice(0, 5).map((workflow) => <div key={workflow._id}><strong>{workflow.name}</strong><span>{workflow.frequency} · Draft · disabled</span></div>)}</div>
                : <EmptyState title="No workflow drafts" detail="Create a draft definition. It will not schedule or execute until a separate approved service exists." />
          : <EmptyState title={title} detail={detail} />}
      </article>
    </section>

    <article className="automation-panel automation-tab-panel">
      <header className="automation-panel-header"><div><Icon size={15} /><h2>{activeTab === 'workflows' ? 'Saved workflow drafts' : selectedTab.label}</h2></div><div className="automation-toolbar-actions"><button type="button" aria-label="Refresh workflow data" onClick={() => activeTab === 'workflows' ? setRefreshVersion((version) => version + 1) : requestIntegration()}><RefreshCw size={13} /></button><button type="button" onClick={createWorkflow}><Plus size={13} /> Add</button></div></header>
      {activeTab === 'workflows'
        ? workflowsLoading ? <EmptyState title="Loading workflow drafts" detail="Fetching your saved draft definitions." />
          : workflowsError ? <EmptyState title="Workflow drafts unavailable" detail={workflowsError} />
            : workflows.length ? <div className="automation-draft-list">{workflows.map((workflow) => <div key={workflow._id}><strong>{workflow.name}</strong><span>{workflow.description || 'No steps or targets configured.'}</span><small>{workflow.frequency} · Draft · disabled</small></div>)}</div>
              : <EmptyState title="No workflow drafts" detail="Saved definitions will appear here. Scheduling and execution are unavailable." />
        : <EmptyState title={title} detail={detail} />}
    </article>

    <footer className="automation-footer"><span><span className="automation-status-dot" /> {backendStatus}</span><span><Clock3 size={11} /> Drafts do not run or schedule actions</span></footer>
  </div>
}
