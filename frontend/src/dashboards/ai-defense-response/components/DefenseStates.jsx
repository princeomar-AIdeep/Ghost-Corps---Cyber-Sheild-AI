import { FileWarning, LoaderCircle, TriangleAlert } from 'lucide-react'

export function DefenseEmptyState({ title, detail, icon: Icon = FileWarning }) {
  return <div className="adr-empty"><span><Icon size={21} /></span><strong>{title}</strong><p>{detail}</p></div>
}
export function DefenseLoadingState({ label = 'Loading defense data' }) {
  return <div className="adr-state"><LoaderCircle className="adr-spin" size={17} />{label}</div>
}
export function DefenseErrorState({ message = 'Defense data could not be loaded.' }) {
  return <div className="adr-state adr-error"><TriangleAlert size={16} />{message}</div>
}
