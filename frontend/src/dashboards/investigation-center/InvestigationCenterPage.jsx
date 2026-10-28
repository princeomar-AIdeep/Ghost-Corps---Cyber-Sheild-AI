import { useEffect, useState } from 'react'
import {
  Activity, ArrowUpRight, BarChart3, BellRing, ChevronDown, ChevronRight,
  CircleHelp, ClipboardList, Clock3, Database, FilePlus2, FileSearch, FileText,
  Fingerprint, Folder, GitBranch, Globe2, Layers3, ListFilter, Network,
  Search, ShieldAlert, ShieldCheck, Sparkles, Users, Workflow,
} from 'lucide-react'
import heroImage from './assets/investigation-hero.png'
import worldMapImage from './assets/world-network-map.png'
import {
  createInvestigation,
  fetchRecentInvestigationCases,
  updateInvestigationCase,
} from './services/investigationApi.js'
import { validateInvestigationCasesResponse } from './services/investigationResponse.js'
import { InvestigationConnectionNote, InvestigationEmptyState } from './components/InvestigationStates.jsx'
import './styles.css'

const tools = [
  { title: 'New Investigation', description: 'Create and manage investigation cases', icon: FilePlus2, tone: 'blue' },
  { title: 'Evidence Manager', description: 'Collect, store and organize evidence', icon: Folder, tone: 'teal' },
  { title: 'Timeline Analysis', description: 'Visualize event timelines', icon: GitBranch, tone: 'red' },
  { title: 'Behavior Analytics', description: 'Analyze user and entity behavior', icon: BarChart3, tone: 'cyan' },
  { title: 'Forensic Tools', description: 'Access digital forensics tools', icon: Search, tone: 'slate' },
  { title: 'Report Generation', description: 'Generate detailed investigation reports', icon: FileText, tone: 'purple' },
]
const stats = [
  { label: 'Total Cases', icon: Folder, tone: 'blue' }, { label: 'Open Cases', icon: ShieldAlert, tone: 'red' },
  { label: 'Evidence Items', icon: Database, tone: 'teal' }, { label: 'Analyzed Endpoints', icon: Workflow, tone: 'purple' },
  { label: 'Detected Anomalies', icon: TriangleIcon, tone: 'red' },
]
const caseStatuses = ['Open', 'In Progress', 'Under Review', 'Resolved', 'False Positive', 'Others']
const anomalyTypes = ['Suspicious Login', 'Unusual File Access', 'Malware Activity', 'Data Exfiltration', 'Privilege Escalation', 'Lateral Movement', 'Others']
const evidenceTypes = ['Log Files', 'Memory Dumps', 'Network Captures', 'Disk Images', 'Registry Data', 'Email Artifacts', 'Others']
const severityTypes = ['Critical', 'Suspicious', 'Normal', 'Unknown']

function TriangleIcon(props) { return <ShieldAlert {...props} /> }
function Panel({ title, icon: Icon, action, className = '', children }) {
  return <section className={`ic-panel ${className}`}><header className="ic-panel-head"><div><Icon size={16} /><h2>{title}</h2></div>{action}</header>{children}</section>
}
function RangeSelect({ range, setRange }) {
  return <label className="ic-range"><span className="ic-sr">Select investigation time range</span><select value={range} onChange={(event) => setRange(event.target.value)}><option>This Week</option><option>Today</option><option>This Month</option><option>All Time</option></select><ChevronDown size={13} /></label>
}
function MapGraphic({ reducedMotion }) {
  return <div className="ic-map-art" role="img" aria-label="Illustrative world map with animated network transfer pathways; no activity data is connected">
    <img src={worldMapImage} alt="" />
    <svg viewBox="0 0 1774 887" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <path id="ic-route-a" d="M255 232 Q595 80 954 231" /><path id="ic-route-b" d="M390 310 Q607 176 821 267" />
        <path id="ic-route-c" d="M954 231 Q1139 164 1332 224" /><path id="ic-route-d" d="M954 231 Q1018 329 1123 374" />
        <path id="ic-route-e" d="M1123 374 Q1285 456 1545 520" /><path id="ic-route-f" d="M454 594 Q659 398 834 350" />
        <path id="ic-route-g" d="M834 350 Q1070 243 1332 224" />
      </defs>
      {!reducedMotion && <g className="ic-packets">{['a','b','c','d','e','f','g'].map((id, index) => <circle key={id} r={index % 2 ? 4 : 5} className={`ic-packet p${index}`}><animateMotion dur={`${6.8 + index * .28}s`} begin={`${-index * 1.05}s`} repeatCount="indefinite"><mpath href={`#ic-route-${id}`} /></animateMotion></circle>)}</g>}
    </svg>
  </div>
}

export default function InvestigationCenterPage({ showToast = () => {} }) {
  const [range, setRange] = useState('This Week')
  const [reducedMotion, setReducedMotion] = useState(false)
  const [cases, setCases] = useState([])
  const [caseCounts, setCaseCounts] = useState({ totalCases: 0, openCases: 0 })
  const [casesLoading, setCasesLoading] = useState(true)
  const [casesError, setCasesError] = useState('')
  const [showCaseForm, setShowCaseForm] = useState(false)
  const [caseTitle, setCaseTitle] = useState('')
  const [caseDescription, setCaseDescription] = useState('')
  const [caseSeverity, setCaseSeverity] = useState('unknown')
  const [caseSaving, setCaseSaving] = useState(false)
  const [caseSaveError, setCaseSaveError] = useState('')
  const [refreshCases, setRefreshCases] = useState(0)
  const [updatingCaseId, setUpdatingCaseId] = useState('')
  const [caseUpdateError, setCaseUpdateError] = useState('')
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(query.matches)
    update(); query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    setCasesLoading(true)
    setCasesError('')
    fetchRecentInvestigationCases({ signal: controller.signal })
      .then((response) => {
        const result = validateInvestigationCasesResponse(response)
        setCases(result.cases)
        setCaseCounts({
          totalCases: result.totalCases,
          openCases: result.openCases,
        })
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setCasesError('Investigation case records could not be loaded.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setCasesLoading(false)
      })
    return () => controller.abort()
  }, [refreshCases])
  const unavailable = (name) => showToast(`${name} is unavailable; the required investigation service is not configured`)
  const saveCase = async (event) => {
    event.preventDefault()
    setCaseSaveError('')
    setCaseSaving(true)
    try {
      await createInvestigation({ title: caseTitle, description: caseDescription, severity: caseSeverity })
      setCaseTitle('')
      setCaseDescription('')
      setCaseSeverity('unknown')
      setShowCaseForm(false)
      setRefreshCases((version) => version + 1)
      showToast('Investigation case record saved. No forensic analysis was performed.')
    } catch {
      setCaseSaveError('The case record could not be saved. No investigation was run.')
    } finally {
      setCaseSaving(false)
    }
  }
  const changeCaseStatus = async (item, status) => {
    if (!item?._id || item.status === status) return
    setUpdatingCaseId(item._id)
    setCaseUpdateError('')
    try {
      const updated = await updateInvestigationCase(item._id, { status })
      setCases((current) => current.map((record) => record._id === updated._id ? updated : record))
      setCaseCounts((current) => ({
        ...current,
        openCases: current.openCases + Number(updated.status === 'open') - Number(item.status === 'open'),
      }))
      showToast('Investigation case status updated.')
    } catch (error) {
      setCaseUpdateError(error instanceof Error ? error.message : 'Investigation case status was not updated.')
    } finally {
      setUpdatingCaseId('')
    }
  }
  const rangeAction = <RangeSelect range={range} setRange={setRange} />

  return <div className="investigation-page">
    <section className="ic-hero" style={{ '--ic-hero-image': `url("${heroImage}")` }} aria-labelledby="ic-title">
      <div className="ic-hero-copy"><span className="ic-eyebrow"><ShieldCheck size={15} /> INVESTIGATION CENTER</span><h1 id="ic-title">Investigation Center</h1><h2>Digital Forensics · Behavior Analytics</h2><p>Investigation cases, evidence timelines, activity analysis<br className="ic-desktop" /> and anomaly visualizations.</p></div>
      <p className="ic-tagline">“Trace. Investigate. Understand.<br />A safer digital world tomorrow.”</p>
    </section>
    <section className="ic-tools" aria-label="Investigation tools">{tools.map(({ title, description, icon: Icon, tone }) => <button key={title} className={`ic-tool ${tone}`} type="button" onClick={() => title === 'New Investigation' ? setShowCaseForm((open) => !open) : unavailable(title)}><span className="ic-tool-icon"><Icon size={23} /></span><span><strong>{title}</strong><small>{description}</small></span><ChevronRight size={15} /></button>)}</section>
    {showCaseForm && <form className="ic-panel" onSubmit={saveCase} aria-label="Create investigation case record">
      <div className="ic-panel-head"><div><FilePlus2 size={16} /><h2>New case record</h2></div></div>
      <div className="ic-subtitle">User-entered case metadata only. This does not collect evidence or perform forensic analysis.</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: 12 }}>
        <label className="form-label">Title<input required maxLength={200} value={caseTitle} onChange={(event) => setCaseTitle(event.target.value)} /></label>
        <label className="form-label">Severity<select value={caseSeverity} onChange={(event) => setCaseSeverity(event.target.value)}><option value="unknown">Unknown</option><option value="normal">Normal</option><option value="suspicious">Suspicious</option><option value="critical">Critical</option></select></label>
        <label className="form-label" style={{ flex: '1 1 100%' }}>Description<textarea maxLength={4000} value={caseDescription} onChange={(event) => setCaseDescription(event.target.value)} /></label>
        {caseSaveError && <p className="form-error" role="alert">{caseSaveError}</p>}
        <button className="primary compact" type="submit" disabled={caseSaving}>{caseSaving ? 'Saving…' : 'Save case record'}</button>
        <button className="button-outline" type="button" onClick={() => setShowCaseForm(false)} disabled={caseSaving}>Cancel</button>
      </div>
    </form>}
    <section className="ic-stats" aria-label="Investigation statistics">{stats.map(({ label, icon: Icon, tone }) => {
      const value = label === 'Total Cases' ? (casesLoading ? '…' : caseCounts.totalCases)
        : label === 'Open Cases' ? (casesLoading ? '…' : caseCounts.openCases)
          : '—'
      const note = label === 'Total Cases' || label === 'Open Cases'
        ? casesError || 'User-entered case records'
        : 'Unavailable: no analysis service'
      return <article className="ic-stat" key={label}><span className={`ic-stat-icon ${tone}`}><Icon size={20} /></span><div><span>{label}</span><strong>{casesError && (label === 'Total Cases' || label === 'Open Cases') ? '—' : value}</strong><small>{note}</small></div><span className="ic-stat-more">···</span></article>
    })}</section>

    <div className="ic-grid">
      <Panel title="Investigation Case Status" icon={ShieldCheck} action={rangeAction} className="ic-case-status"><p className="ic-subtitle">Overview of all investigation cases</p><div className="ic-case-body"><div className="ic-donut"><span><Folder size={24} />—<small>Total Cases</small></span></div><div className="ic-legend">{caseStatuses.map((label, i) => <div key={label}><i className={`ic-dot c${i}`} /><span>{label}</span><small>—</small></div>)}</div></div></Panel>
      <Panel title="Global Activity Map" icon={Globe2} className="ic-map-panel"><p className="ic-subtitle">Global activity overview · service not connected</p><div className="ic-map-stage"><MapGraphic reducedMotion={reducedMotion} /><div className="ic-live-card"><i />Activity<strong>—</strong><small>Waiting for backend</small></div><div className="ic-map-legend">{severityTypes.map((label, index) => <span key={label}><i className={`severity-${index}`} />{label}</span>)}</div><small className="ic-map-note">Illustrative network pathways · not live activity</small></div></Panel>
      <Panel title="Recent Investigation Cases" icon={ClipboardList} className="ic-recent" action={<button className="ic-view" type="button" onClick={() => setRefreshCases((version) => version + 1)} disabled={casesLoading}>Refresh <ChevronRight size={14} /></button>}><div className="ic-table-wrap">{caseUpdateError && <p className="form-error" role="alert">{caseUpdateError}</p>}<table><thead><tr><th>ID</th><th>Title</th><th>Severity</th><th>Status</th><th>Created</th></tr></thead><tbody>
        {casesLoading ? <tr><td colSpan="5"><InvestigationEmptyState title="Loading case records" detail="Fetching your saved case metadata." /></td></tr>
          : casesError ? <tr><td colSpan="5"><InvestigationEmptyState title="Case records unavailable" detail={casesError} /></td></tr>
            : cases.length ? cases.map((item) => <tr key={item._id}><td>{item._id.slice(-6)}</td><td>{item.title}</td><td>{item.severity}</td><td><select aria-label={`Status for ${item.title}`} value={item.status || 'open'} onChange={(event) => changeCaseStatus(item, event.target.value)} disabled={updatingCaseId === item._id}><option value="open">Open</option><option value="in_progress">In Progress</option><option value="under_review">Under Review</option><option value="resolved">Resolved</option><option value="false_positive">False Positive</option></select></td><td>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '—'}</td></tr>)
              : <tr><td colSpan="5"><InvestigationEmptyState title="No case records yet" detail="Create a case record to organize user-provided investigation notes." /></td></tr>}
      </tbody></table></div></Panel>
      <Panel title="Top Anomaly Types" icon={ListFilter} action={rangeAction} className="ic-anomalies"><div className="ic-bars">{anomalyTypes.map((label, i) => <div key={label}><span className={`ic-anomaly-icon a${i}`}><Activity size={13} /></span><span>{label}</span><i /><small>—</small></div>)}</div></Panel>
      <Panel title="Timeline of Investigation" icon={Clock3} action={<button className="ic-view" type="button" onClick={() => unavailable('Investigation timeline')}>View all <ChevronRight size={14} /></button>} className="ic-timeline"><InvestigationEmptyState icon={Workflow} title="No timeline events available" detail="Verified investigation events will appear here after the service is connected." /></Panel>
      <Panel title="Evidence Types" icon={Layers3} action={rangeAction} className="ic-evidence"><div className="ic-evidence-body"><div className="ic-donut evidence-donut"><span><FileSearch size={23} />—<small>Total Evidence</small></span></div><div className="ic-legend">{evidenceTypes.map((label, i) => <div key={label}><i className={`ic-dot e${i}`} /><span>{label}</span><small>—</small></div>)}</div></div></Panel>
    </div>
    <InvestigationConnectionNote />
  </div>
}
