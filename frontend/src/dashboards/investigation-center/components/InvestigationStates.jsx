import { CircleHelp, FileSearch, LoaderCircle, TriangleAlert } from 'lucide-react'

export function InvestigationEmptyState({ title, detail, icon: Icon = FileSearch }) {
  return <div className="ic-empty"><span><Icon size={21} /></span><strong>{title}</strong><p>{detail}</p></div>
}

export function InvestigationLoadingState({ label = 'Loading investigation data' }) {
  return <div className="ic-state"><LoaderCircle size={18} className="ic-spin" />{label}</div>
}

export function InvestigationErrorState({ message = 'Investigation data could not be loaded.' }) {
  return <div className="ic-state ic-error"><TriangleAlert size={17} />{message}</div>
}

export function InvestigationConnectionNote() {
  return <aside className="ic-connection"><CircleHelp size={15} /><strong>Investigation service not connected</strong><span>Connect the backend to load verified cases, evidence, activity and reports.</span></aside>
}
