import { useState } from 'react'
import {
  Activity, AlertTriangle, ArrowUpRight, BarChart3, Bug, ChevronDown,
  ChevronRight, CircleHelp, Database, FileText, Globe2, Link2, MapPin,
  Radar, Search, ShieldCheck,
  Signal, WalletCards,
} from 'lucide-react'
import { ThreatIntelligenceEmptyState } from './components/ThreatIntelligenceStates.jsx'
import UsbMonitor from '../UsbMonitor.jsx'
import './styles.css'

const tools = [
  { title: 'Threat Feeds', description: 'Live global threat intelligence feeds', icon: Database, tone: 'cyan' },
  { title: 'Suspicious URLs', description: 'Run the authorized heuristic URL scan', icon: Link2, tone: 'cyan' },
  { title: 'Fraud Detection', description: 'Detect fraudulent activities & patterns', icon: AlertTriangle, tone: 'red' },
  { title: 'Threat Reports', description: 'View and manage threat reports', icon: FileText, tone: 'blue' },
  { title: 'IOC Search', description: 'Search IPs, domains, hashes & indicators', icon: Search, tone: 'purple' },
  { title: 'Intelligence Dashboard', description: 'Visualize the global threat landscape', icon: BarChart3, tone: 'purple' },
]

const statistics = [
  { label: 'Total Threats Detected', key: 'totalThreatsDetected', icon: Bug, tone: 'red' },
  { label: 'Malicious URLs', key: 'maliciousUrls', icon: Link2, tone: 'red' },
  { label: 'Fraud Indicators', key: 'fraudIndicators', icon: WalletCards, tone: 'purple' },
  { label: 'Active Threat Feeds', key: 'activeThreatFeeds', icon: Database, tone: 'cyan' },
]

const categories = ['Malware', 'Phishing', 'Suspicious URLs', 'Fraud', 'C2 Communication', 'Others']

function Panel({ title, icon: Icon, action, children, className = '' }) {
  return <section className={`ti-panel ${className}`}>
    <header className="ti-panel-header"><div className="ti-panel-title"><Icon size={16} /><h2>{title}</h2></div>{action}</header>
    {children}
  </section>
}

function RangeSelect({ value, onChange }) {
  return <label className="ti-range"><span className="ti-sr-only">Threat data time range</span><select value={value} onChange={(event) => onChange(event.target.value)}><option>This Week</option><option>Today</option><option>This Month</option><option>All Time</option></select><ChevronDown size={13} /></label>
}

export default function ThreatIntelligencePage({ showToast = () => {}, token, onOpenModal }) {
  const [range, setRange] = useState('This Week')
  const handleUnavailable = (tool) => showToast(`${tool} is waiting for the threat intelligence service`)
  const openTool = (tool) => {
    if (tool === 'Suspicious URLs' && onOpenModal) {
      onOpenModal('Scan URL')
      return
    }
    handleUnavailable(tool)
  }

  return <div className="threat-intelligence-page">
    <section className="ti-hero" aria-labelledby="ti-heading">
      <div className="ti-hero-copy">
        <span className="ti-eyebrow"><ShieldCheck size={15} /> THREAT INTELLIGENCE CENTER</span>
        <h1 id="ti-heading">Threat Intelligence Center</h1>
        <h2>Threat Detection · Fraud Detection</h2>
        <p>Threat feeds, suspicious URLs, fraud indicators, threat reports and intelligence dashboards.</p>
      </div>
      <p className="ti-hero-tagline">“Detect. Analyze. Prevent.<br />A safer digital world tomorrow.”</p>
    </section>

    <section className="ti-tools" aria-label="Threat intelligence tools">
      {tools.map(({ title, description, icon: Icon, tone }) => <button type="button" className={`ti-tool-card ${tone}`} key={title} onClick={() => openTool(title)}>
        <span className="ti-tool-icon"><Icon size={23} /></span><span className="ti-tool-copy"><strong>{title}</strong><small>{description}</small></span><ChevronRight size={16} className="ti-tool-arrow" />
      </button>)}
    </section>

    <section className="ti-statistics" aria-label="Threat statistics">
      {statistics.map(({ label, key, icon: Icon, tone }) => <article className="ti-stat-card" key={key}>
        <span className={`ti-stat-icon ${tone}`}><Icon size={19} /></span><div className="ti-stat-copy"><span>{label}</span><strong aria-label={`${label}: unavailable`}>—</strong><small>Waiting for backend connection</small></div><span className="ti-stat-more" aria-hidden="true">···</span>
      </article>)}
    </section>

    <div className="ti-main-grid">
      <Panel title="Global Threat Map" icon={Globe2} className="ti-map-panel">
        <div className="ti-panel-subtitle">Live view of cyber threats around the world</div>
        <div className="ti-map-content">
          <div className="ti-map-grid" aria-hidden="true"><div className="ti-map-globe"><span /><span /><span /></div></div>
          <div className="ti-map-wait"><Signal size={19} /><strong>Threat event feed not connected</strong><small>No map events are available</small></div>
          <div className="ti-map-legend" aria-label="Threat risk legend"><span><i className="high" />High Risk</span><span><i className="medium" />Medium Risk</span><span><i className="low" />Low Risk</span></div>
          <div className="ti-live-summary"><span className="ti-muted-dot" />Attack Events <strong>—</strong><small>No events</small></div>
        </div>
      </Panel>

      <Panel title="Recent Threats" icon={Activity} action={<button type="button" className="ti-text-action" onClick={() => handleUnavailable('Recent threats')}>View all <ChevronRight size={14} /></button>} className="ti-recent-panel">
        <div className="ti-table-wrap"><table className="ti-table"><thead><tr><th>Time</th><th>Type</th><th>Indicator</th><th>Risk</th><th>Location</th><th aria-label="Actions" /></tr></thead><tbody><tr><td colSpan="6"><ThreatIntelligenceEmptyState title="No threat records available" detail="Recent threats will appear when the service is connected." /></td></tr></tbody></table></div>
      </Panel>

      <Panel title="Threat Categories" icon={Radar} action={<RangeSelect value={range} onChange={setRange} />} className="ti-category-panel">
        <div className="ti-category-body"><div className="ti-donut" aria-label="Threat category chart has no data"><span /></div><div className="ti-category-list">{categories.map((category, index) => <div key={category}><i className={`cat-${index}`} /><span>{category}</span><small>—</small></div>)}</div></div>
        <p className="ti-chart-note">Category totals will appear when data is available.</p>
      </Panel>

      <Panel title="Top Threat Sources" icon={MapPin} action={<RangeSelect value={range} onChange={setRange} />} className="ti-sources-panel">
        <div className="ti-source-empty"><Globe2 size={22} /><span>No source distribution available</span><small>Connect the threat intelligence service to load verified sources.</small></div>
      </Panel>

      <Panel title="Threat Intelligence Feeds" icon={Signal} action={<button type="button" className="ti-text-action" onClick={() => handleUnavailable('Threat feeds')}>View all <ChevronRight size={14} /></button>} className="ti-feeds-panel">
        <div className="ti-table-wrap"><table className="ti-table ti-feed-table"><thead><tr><th>Feed Name</th><th>Status</th><th>Last Updated</th><th>Indicators</th><th aria-label="Actions" /></tr></thead><tbody><tr><td colSpan="5"><ThreatIntelligenceEmptyState title="Threat intelligence service not connected" detail="Configured feeds and their status will appear here." /></td></tr></tbody></table></div>
      </Panel>
    </div>

    <section className="ti-integration-note" aria-label="Backend connection status"><CircleHelp size={15} /><span>Threat data unavailable</span><small>Connect the threat intelligence service to load verified data.</small><button type="button" onClick={() => handleUnavailable('Threat intelligence connection')}>Connection details <ArrowUpRight size={13} /></button></section>

    <UsbMonitor token={token} showToast={showToast} />
  </div>
}
