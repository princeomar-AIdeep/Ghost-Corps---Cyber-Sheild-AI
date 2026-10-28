import { useEffect, useState } from 'react'
import {
  Activity, AlertOctagon, ArrowRight, BellRing, Bot, CheckCircle2, ChevronDown,
  ChevronRight, CircleHelp, ClipboardList, Clock3, Cpu, FileText, Fingerprint,
  Gauge, LockKeyhole, Network, Search, Settings2, Shield, ShieldAlert, ShieldCheck,
  Siren, Sparkles, Workflow, Zap,
} from 'lucide-react'
import heroImage from './assets/ai-defense-hero.png'
import { DefenseEmptyState } from './components/DefenseStates.jsx'
import { fetchDefenseStatus } from './services/aiDefenseApi.js'
import './styles.css'

const tools = [
  { title: 'AI Safety Policies', description: 'Configure guardrails and safety rules', icon: ShieldCheck, tone: 'cyan' },
  { title: 'Response Playbooks', description: 'Automate incident response actions', icon: Workflow, tone: 'blue' },
  { title: 'Incident Handling', description: 'Investigate and manage incidents', icon: AlertOctagon, tone: 'red' },
  { title: 'Containment Status', description: 'Track active containment', icon: Cpu, tone: 'teal' },
  { title: 'Audit Trails', description: 'View logs and compliance records', icon: FileText, tone: 'purple' },
]
const stats = [
  { label: 'Policy Violations', icon: ShieldAlert, tone: 'red' },
  { label: 'Active Incidents', icon: Siren, tone: 'red' },
  { label: 'Resolved Incidents', icon: CheckCircle2, tone: 'teal' },
  { label: 'System Uptime', icon: Settings2, tone: 'purple' },
]
const safetyPolicies = ['Content Filtering', 'Prompt Guardrails', 'Data Privacy', 'Model Protection', 'Others']
const responseStages = [{ label: 'Detect', icon: Search }, { label: 'Analyze', icon: Cpu }, { label: 'Respond', icon: Zap }, { label: 'Contain', icon: ShieldCheck }]
const timelineStages = ['Incident Detected', 'Analysis Complete', 'Response Initiated', 'Incident Resolved']

function Panel({ title, icon: Icon, action, className = '', children }) {
  return <section className={`adr-panel ${className}`}><header className="adr-panel-head"><div><Icon size={16} /><h2>{title}</h2></div>{action}</header>{children}</section>
}
function RangeSelect({ range, onChange }) {
  return <label className="adr-range"><span className="adr-sr">Select defense time range</span><select value={range} onChange={(event) => onChange(event.target.value)}><option>This Week</option><option>Today</option><option>This Month</option><option>All Time</option></select><ChevronDown size={13} /></label>
}

export default function AIDefenseResponsePage({ showToast = () => {} }) {
  const [range, setRange] = useState('This Week')
  const [serviceState, setServiceState] = useState({ kind: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    fetchDefenseStatus({ signal: controller.signal })
      .then((status) => setServiceState(status?.available
        ? { kind: 'available', status }
        : { kind: 'unavailable', reason: status?.reason || 'AI defense service is unavailable.' }))
      .catch(() => {
        if (!controller.signal.aborted) setServiceState({ kind: 'error' })
      })
    return () => controller.abort()
  }, [])
  const notify = (feature) => showToast(`${feature} is waiting for the AI defense service`)
  const rangeAction = <RangeSelect range={range} onChange={setRange} />

  return <div className="ai-defense-page">
    <section className="adr-hero" style={{ '--adr-hero': `url("${heroImage}")` }} aria-labelledby="adr-title">
      <div className="adr-hero-copy"><span className="adr-eyebrow"><ShieldCheck size={15} /> AI DEFENSE &amp; RESPONSE</span><h1 id="adr-title">AI Defense &amp; Response</h1><h2>Runtime Guardrails · Automatic Incident Response</h2><p>AI safety policies, response playbooks, incident handling, containment<br className="adr-wide" /> status and audit trails.</p></div>
      <p className="adr-tagline">Smarter Defense.<br />Faster Response.<br />Safer AI.</p>
    </section>
    <section className="adr-tools" aria-label="AI defense tools">{tools.map(({ title, description, icon: Icon, tone }) => <button key={title} type="button" className={`adr-tool ${tone}`} onClick={() => notify(title)}><span className="adr-tool-icon"><Icon size={23} /></span><span><strong>{title}</strong><small>{description}</small></span><ChevronRight size={15} /></button>)}</section>
    <section className="adr-stats" aria-label="AI defense statistics">{stats.map(({ label, icon: Icon, tone }) => <article className="adr-stat" key={label}><span className={`adr-stat-icon ${tone}`}><Icon size={21} /></span><div><span>{label}</span><strong>—</strong><small>Waiting for backend</small></div><span className="adr-more">···</span></article>)}</section>

    <div className="adr-grid">
      <Panel title="Threat Response Overview" icon={Settings2} className="adr-overview"><p className="adr-subtitle">AI defense and incident response status</p><div className="adr-overview-content"><div className="adr-radar" aria-hidden="true"><i className="radar-ring ring-one" /><i className="radar-ring ring-two" /><i className="radar-ring ring-three" /><i className="radar-sweep" /><span><Shield size={45} /><LockKeyhole size={15} /></span><b className="radar-node node-a" /><b className="radar-node node-b" /><b className="radar-node node-c" /><b className="radar-node node-d" /></div><div className="adr-system-status">{['Guardrails Status', 'Response Engine', 'Incident Queue', 'Containment'].map((label, i) => <div key={label}><i className={`adr-status-dot d${i}`} /><span>{label}</span><small>—</small></div>)}</div></div></Panel>
      <Panel title="Recent Incidents" icon={ClipboardList} className="adr-recent" action={<button type="button" className="adr-view" onClick={() => notify('Incident list')}>View all <ChevronRight size={14} /></button>}><div className="adr-table"><table><thead><tr><th>Time</th><th>Type</th><th>Severity</th><th>Status</th><th>Action</th></tr></thead><tbody><tr><td colSpan="5"><DefenseEmptyState title="No incidents found" detail="Incident data will appear here once the backend is configured." icon={BellRing} /></td></tr></tbody></table></div></Panel>
      <Panel title="AI Safety Policies" icon={Settings2} action={rangeAction} className="adr-policy"><div className="adr-policy-content"><div className="adr-policy-donut"><span>—<small>Policy Status</small></span></div><div className="adr-policy-legend">{safetyPolicies.map((label, i) => <div key={label}><i className={`policy-dot p${i}`} /><span>{label}</span><i className="adr-empty-track" /><small>—</small></div>)}</div></div></Panel>
      <Panel title="Response Playbooks" icon={Settings2} action={<button type="button" className="adr-view" onClick={() => notify('Response playbooks')}>View all <ChevronRight size={14} /></button>} className="adr-playbooks"><div className="adr-playbook-flow">{responseStages.map(({ label, icon: Icon }, i) => <div className="adr-stage-wrap" key={label}><div className="adr-stage"><span><Icon size={23} /></span><strong>{label}</strong><small>Waiting for backend</small></div>{i < responseStages.length - 1 && <ArrowRight className="adr-stage-arrow" size={16} />}</div>)}</div></Panel>
      <Panel title="Incident Timeline" icon={Clock3} action={<button type="button" className="adr-view" onClick={() => notify('Incident timeline')}>View all <ChevronRight size={14} /></button>} className="adr-timeline"><div className="adr-timeline-list">{timelineStages.map((label, i) => <div key={label}><i className={`timeline-dot t${i}`} /><strong>{label}</strong><span>—</span><small>Waiting for backend</small></div>)}</div></Panel>
    </div>
    <aside className="adr-connection" aria-live="polite"><CircleHelp size={15} />
      <strong>{serviceState.kind === 'loading' ? 'Checking AI defense service' : serviceState.kind === 'error' ? 'AI defense status unavailable' : 'AI defense service not configured'}</strong>
      <span>{serviceState.kind === 'loading'
        ? 'Checking backend availability. No defense action is being performed.'
        : serviceState.kind === 'error'
          ? 'Could not verify the AI defense service. Policy enforcement and incident response remain unavailable.'
          : 'Policy enforcement, containment, incident response, and audit events are disabled. No defense action is being performed.'}</span>
    </aside>
  </div>
}
