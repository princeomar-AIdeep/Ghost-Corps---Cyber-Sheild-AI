import { AlertTriangle, LoaderCircle, ShieldAlert } from 'lucide-react'

export function ThreatIntelligenceEmptyState({ title = 'No threat records available', detail = 'Connect the threat intelligence service to display verified data here.' }) {
  return <div className="ti-empty-state"><span className="ti-empty-icon"><ShieldAlert size={18} /></span><strong>{title}</strong><p>{detail}</p></div>
}

export function ThreatIntelligenceLoadingState({ label = 'Loading threat data…' }) {
  return <div className="ti-state" role="status"><LoaderCircle size={18} className="ti-spinner" /><span>{label}</span></div>
}

export function ThreatIntelligenceErrorState({ message = 'Threat data unavailable' }) {
  return <div className="ti-state ti-error" role="alert"><AlertTriangle size={17} /><span>{message}</span></div>
}

