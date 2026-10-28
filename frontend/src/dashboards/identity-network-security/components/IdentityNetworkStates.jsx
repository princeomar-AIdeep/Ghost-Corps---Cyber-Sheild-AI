import { AlertTriangle, LoaderCircle, ShieldCheck } from 'lucide-react'

export function IdentityNetworkEmptyState({ title = 'No access records available', detail = 'Access data will appear here once the backend integration is configured.' }) {
  return <div className="in-empty"><span className="in-empty-icon"><ShieldCheck size={18} /></span><strong>{title}</strong><p>{detail}</p></div>
}

export function IdentityNetworkLoadingState({ label = 'Loading identity data…' }) {
  return <div className="in-state" role="status"><LoaderCircle className="in-spinner" size={17} /><span>{label}</span></div>
}

export function IdentityNetworkErrorState({ message = 'Identity data unavailable' }) {
  return <div className="in-state in-error" role="alert"><AlertTriangle size={16} /><span>{message}</span></div>
}

