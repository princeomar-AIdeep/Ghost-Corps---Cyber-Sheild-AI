import { AlertTriangle, LoaderCircle, ShieldCheck } from 'lucide-react'

export function SecurityTestingEmptyState({ title = 'No scan records available', detail = 'Scan data will appear here once the backend integration is configured.' }) {
  return <div className="st-empty"><span className="st-empty-icon"><ShieldCheck size={18} /></span><strong>{title}</strong><p>{detail}</p></div>
}

export function SecurityTestingLoadingState({ label = 'Loading scan data…' }) {
  return <div className="st-state" role="status"><LoaderCircle size={17} className="st-spinner" /><span>{label}</span></div>
}

export function SecurityTestingErrorState({ message = 'Scan data unavailable' }) {
  return <div className="st-state st-error" role="alert"><AlertTriangle size={16} /><span>{message}</span></div>
}

