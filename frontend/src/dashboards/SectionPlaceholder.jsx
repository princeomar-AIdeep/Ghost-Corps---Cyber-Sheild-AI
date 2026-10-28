import { ArrowRight, CircleAlert } from 'lucide-react'

/**
 * Design-matched placeholder for dashboard sections that do not yet have a full UI module.
 * Optional actions reuse existing Cyber-Shield features (scans, projects, etc.).
 */
export default function SectionPlaceholder({
  kicker = 'Cyber Shield AI',
  title,
  subtitle,
  detail,
  imageSrc,
  actions = [],
  badge = 'UI ready · feature module pending',
}) {
  return (
    <div className="section-placeholder">
      <section className="section-placeholder-hero" style={imageSrc ? { backgroundImage: `linear-gradient(90deg, rgba(3,10,16,.94), rgba(3,11,17,.72) 55%, rgba(3,11,17,.35)), url('${imageSrc}')` } : undefined}>
        <div className="section-placeholder-copy">
          <span className="section-placeholder-kicker">{kicker}</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="section-placeholder-badge"><CircleAlert size={14} />{badge}</div>
      </section>

      <section className="section-placeholder-panel">
        <h2>Workspace status</h2>
        <p>{detail}</p>
        {actions.length > 0 && (
          <div className="section-placeholder-actions">
            {actions.map(({ label, onClick, primary }) => (
              <button key={label} type="button" className={primary ? 'section-placeholder-primary' : 'section-placeholder-secondary'} onClick={onClick}>
                {label} <ArrowRight size={14} />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
