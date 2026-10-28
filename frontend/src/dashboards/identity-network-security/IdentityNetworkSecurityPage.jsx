import { useEffect, useState } from 'react'
import {
  Activity, ArrowUpRight, BadgeCheck, ChevronDown, ChevronRight,
  CircleHelp, Contrast, FileText, Globe2, KeyRound, LockKeyhole, Monitor,
  Network, Radio, RefreshCw, ScanEye, Shield, ShieldAlert, ShieldCheck,
  ShieldX, SlidersHorizontal, UserRound, Users, Wifi,
} from 'lucide-react'
import networkMapImage from './assets/world-network-map.png'
import { IdentityNetworkEmptyState } from './components/IdentityNetworkStates.jsx'
import './styles.css'

const tools = [
  { title: 'Access Policies', description: 'Manage access rules and permissions', icon: FileText, tone: 'blue' },
  { title: 'User Management', description: 'Manage your signed-in profile', icon: UserRound, tone: 'purple' },
  { title: 'Session Monitoring', description: 'Track active sessions & devices', icon: BadgeCheck, tone: 'teal' },
  { title: 'Zero Trust Controls', description: 'Enforce zero trust security model', icon: ShieldX, tone: 'red' },
  { title: 'Network Security', description: 'Monitor network access & traffic', icon: Shield, tone: 'cyan' },
  { title: 'Privacy Controls', description: 'Manage data privacy and compliance', icon: UserRound, tone: 'purple' },
]

const statistics = [
  { label: 'Total Users', icon: UserRound, tone: 'blue' },
  { label: 'Active Sessions', icon: Wifi, tone: 'teal' },
  { label: 'Blocked Access Attempts', icon: ShieldX, tone: 'red' },
  { label: 'Trusted Devices', icon: Monitor, tone: 'blue' },
  { label: 'Network Anomalies', icon: Network, tone: 'red' },
]

const accessGroups = ['Active Users', 'Inactive Users', 'Privileged Users', 'External Users', 'Blocked Users', 'Others']
const deviceGroups = ['Trusted Devices', 'Untrusted Devices', 'New Devices', 'Blocked Devices', 'High Risk Devices', 'Others']
const authMethods = ['Password', 'Multi-Factor Authentication', 'SSO (Single Sign-On)', 'Biometric', 'API Tokens', 'Others']
const trafficTypes = ['Allowed Traffic', 'Blocked Traffic', 'Suspicious Traffic', 'VPN Traffic']

function Panel({ title, icon: Icon, action, className = '', children }) {
  return <section className={`in-panel ${className}`}><header className="in-panel-header"><div className="in-panel-title"><Icon size={16} /><h2>{title}</h2></div>{action}</header>{children}</section>
}

function RangeSelect({ value, onChange }) {
  return <label className="in-range"><span className="in-visually-hidden">Identity data time range</span><select value={value} onChange={(event) => onChange(event.target.value)}><option>This Week</option><option>Today</option><option>This Month</option><option>All Time</option></select><ChevronDown size={13} /></label>
}

function NetworkMapGraphic({ reducedMotion }) {
  return <div className="in-world-map" role="img" aria-label="Illustrative world map with animated network transfer pathways">
    <img className="in-world-map-image" src={networkMapImage} alt="" />
    <svg className="in-network-svg" viewBox="0 0 1774 887" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <defs>
        <path id="in-route-a" d="M255 232 Q595 80 954 231" />
        <path id="in-route-b" d="M390 310 Q607 176 821 267" />
        <path id="in-route-c" d="M954 231 Q1139 164 1332 224" />
        <path id="in-route-d" d="M954 231 Q1018 329 1123 374" />
        <path id="in-route-e" d="M1123 374 Q1285 456 1545 520" />
        <path id="in-route-f" d="M454 594 Q659 398 834 350" />
        <path id="in-route-g" d="M834 350 Q1070 243 1332 224" />
      </defs>
      {!reducedMotion && <g className="in-network-packets">
        <circle r="5.1" className="in-packet packet-a"><animateMotion dur="7.3s" repeatCount="indefinite"><mpath href="#in-route-a" /></animateMotion></circle>
        <circle r="4.5" className="in-packet packet-b"><animateMotion dur="6.6s" begin="-2.1s" repeatCount="indefinite"><mpath href="#in-route-b" /></animateMotion></circle>
        <circle r="4.8" className="in-packet packet-c"><animateMotion dur="7.8s" begin="-3.3s" repeatCount="indefinite"><mpath href="#in-route-c" /></animateMotion></circle>
        <circle r="4.2" className="in-packet packet-d"><animateMotion dur="6.9s" begin="-1.2s" repeatCount="indefinite"><mpath href="#in-route-d" /></animateMotion></circle>
        <circle r="4.6" className="in-packet packet-e"><animateMotion dur="8.4s" begin="-4.2s" repeatCount="indefinite"><mpath href="#in-route-e" /></animateMotion></circle>
        <circle r="4.3" className="in-packet packet-f"><animateMotion dur="8.1s" begin="-2.7s" repeatCount="indefinite"><mpath href="#in-route-f" /></animateMotion></circle>
        <circle r="4" className="in-packet packet-g"><animateMotion dur="7.6s" begin="-5s" repeatCount="indefinite"><mpath href="#in-route-g" /></animateMotion></circle>
      </g>}
    </svg>
  </div>
}

export default function IdentityNetworkSecurityPage({ showToast = () => {}, onNavigateLegacy }) {
  const [range, setRange] = useState('This Week')
  const [reducedMotion, setReducedMotion] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(query.matches)
    update()
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [])
  const unavailable = (feature) => showToast(`${feature} is waiting for the identity and network service`)
  const openTool = (feature) => {
    if (feature === 'User Management' && onNavigateLegacy) {
      onNavigateLegacy('Profile')
      return
    }
    unavailable(feature)
  }

  return <div className="identity-network-page">
    <section className="in-hero" aria-labelledby="in-heading">
      <div className="in-hero-copy"><span className="in-eyebrow"><ShieldCheck size={15} /> IDENTITY &amp; NETWORK SECURITY</span><h1 id="in-heading">Identity &amp; Network Security</h1><h2>Identity &amp; Access · Zero Trust · Privacy</h2><p>Access policies, session management, permissions, trust status and privacy controls.</p></div>
      <p className="in-tagline">“Secure Identities.<br />Stronger Networks.<br />A Safer Tomorrow.”</p>
    </section>

    <section className="in-tools" aria-label="Identity and network tools">{tools.map(({ title, description, icon: Icon, tone }) => <button className={`in-tool-card ${tone}`} key={title} type="button" onClick={() => openTool(title)}><span className="in-tool-icon"><Icon size={23} /></span><span className="in-tool-copy"><strong>{title}</strong><small>{description}</small></span><ChevronRight size={16} className="in-tool-arrow" /></button>)}</section>

    <section className="in-stat-grid" aria-label="Identity and network statistics">{statistics.map(({ label, icon: Icon, tone }) => <article className="in-stat-card" key={label}><span className={`in-stat-icon ${tone}`}><Icon size={20} /></span><div className="in-stat-copy"><span>{label}</span><strong>—</strong><small>Waiting for backend</small></div><span className="in-stat-menu" aria-hidden="true">···</span></article>)}</section>

    <div className="in-dashboard-grid">
      <Panel title="Identity Access Overview" icon={Globe2} className="in-access-panel" action={<RangeSelect value={range} onChange={setRange} />}>
        <p className="in-panel-subtitle">User access and authentication status</p>
        <div className="in-access-body"><div className="in-empty-donut"><span><UserRound size={24} />—<small>Total Users</small></span></div><div className="in-access-legend">{accessGroups.map((label, index) => <div key={label}><i className={`in-key-${index}`} /><span>{label}</span><small>—</small></div>)}</div></div>
      </Panel>

      <Panel title="Network Access Map" icon={Globe2} className="in-map-panel">
        <p className="in-panel-subtitle">Network access activity around the world</p>
        <div className="in-map-stage"><NetworkMapGraphic reducedMotion={reducedMotion} /><div className="in-map-status"><i />Active Sessions<strong>—</strong><small>Waiting for backend</small></div><div className="in-map-legend"><span><i className="normal" />Normal</span><span><i className="suspicious" />Suspicious</span><span><i className="blocked" />Blocked</span></div><small className="in-map-note">Illustrative network pathways · service not connected</small></div>
      </Panel>

      <Panel title="Recent Access Activity" icon={RefreshCw} className="in-activity-panel" action={<button type="button" className="in-view-all" onClick={() => unavailable('Access activity')}>View all <ChevronRight size={14} /></button>}>
        <div className="in-table-wrap"><table className="in-table"><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Resource</th><th>Status</th></tr></thead><tbody><tr><td colSpan="5"><IdentityNetworkEmptyState title="No access records available" detail="Access logs will appear here once the backend integration is configured." /></td></tr></tbody></table></div>
      </Panel>

      <Panel title="Authentication Methods" icon={Contrast} className="in-auth-panel" action={<RangeSelect value={range} onChange={setRange} />}>
        <div className="in-auth-list">{authMethods.map((method, index) => <div className="in-auth-row" key={method}><span className={`in-auth-icon in-key-${index}`}>{index === 0 ? <LockKeyhole size={13} /> : index === 1 ? <ShieldCheck size={13} /> : index === 2 ? <Users size={13} /> : index === 3 ? <ScanEye size={13} /> : index === 4 ? <KeyRound size={13} /> : <Radio size={13} />}</span><span>{method}</span><div className="in-auth-empty-bar" /><small>—</small></div>)}</div>
      </Panel>

      <Panel title="Device Trust Status" icon={ShieldCheck} className="in-device-panel" action={<RangeSelect value={range} onChange={setRange} />}>
        <div className="in-device-body"><div className="in-empty-donut device-donut"><span><Monitor size={23} />—<small>Total Devices</small></span></div><div className="in-device-legend">{deviceGroups.map((label, index) => <div key={label}><i className={`in-key-${index}`} /><span>{label}</span><small>—</small></div>)}</div></div>
      </Panel>

      <Panel title="Network Traffic Overview" icon={Activity} className="in-traffic-panel" action={<RangeSelect value={range} onChange={setRange} />}>
        <div className="in-traffic-chart" role="img" aria-label="Network traffic chart has no data"><div className="in-traffic-grid"><i /><i /><i /><i /><i /></div><div className="in-traffic-empty">Traffic data unavailable<br /><small>Connect the network service to view traffic.</small></div></div>
        <div className="in-traffic-legend">{trafficTypes.map((label, index) => <span key={label}><i className={`traffic-${index}`} />{label}</span>)}</div>
      </Panel>
    </div>

    <section className="in-connection-note"><CircleHelp size={15} /><span>Identity and network service not connected</span><small>Connect the backend to load verified users, sessions, access events and traffic.</small><button type="button" onClick={() => unavailable('Identity and network connection')}>Connection details <ArrowUpRight size={13} /></button></section>
  </div>
}
