import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, Shield, Wifi, WifiOff } from 'lucide-react'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

const POLL_INTERVAL = 60 * 1000 // 1 minute

/**
 * SecurityMonitor — 24/7 background scanning status bar.
 *
 * Polls the backend health + scans endpoints to detect new critical threats.
 * Displays a persistent status bar at the bottom of the shell.
 * If a new Critical scan result is found, shows an alert and triggers an
 * email via POST /api/usb/alert (reuses the threat-alert endpoint pattern).
 *
 * Props:
 *   token {string}
 *   showToast {function}
 */
export default function SecurityMonitor({ token, showToast = () => {} }) {
  const [status, setStatus] = useState('idle')   // 'idle' | 'scanning' | 'ok' | 'threat' | 'offline'
  const [lastScan, setLastScan] = useState(null)
  const [threatCount, setThreatCount] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [log, setLog] = useState([])
  const seenIds = useRef(new Set())
  const timerRef = useRef(null)

  const addLog = (msg, type = 'info') =>
    setLog((prev) => [{ msg, type, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 9)])

  const runScan = useCallback(async () => {
    if (!token) return
    setStatus('scanning')

    try {
      // 1. Check backend health
      const health = await fetch(`${API_BASE}/health`)
      if (!health.ok) throw new Error('Backend offline')

      // 2. Fetch recent scans
      const scanRes = await fetch(`${API_BASE}/scans`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (!scanRes.ok) throw new Error('Could not load scans')

      const scans = await scanRes.json()
      const now = Date.now()
      setLastScan(now)

      const recent = Array.isArray(scans) ? scans.slice(0, 20) : []
      let newCritical = 0

      recent.forEach((scan) => {
        if (scan._id && !seenIds.current.has(scan._id)) {
          seenIds.current.add(scan._id)
          if (scan.risk === 'Critical' || scan.risk === 'High') {
            newCritical++
            addLog(`${scan.risk} risk: ${scan.target?.slice(0, 40)}`, 'threat')
          }
        }
      })

      if (newCritical > 0) {
        setStatus('threat')
        setThreatCount((n) => n + newCritical)
        showToast(`⚠️ ${newCritical} new critical threat(s) detected!`)
        addLog(`${newCritical} new critical scan(s) detected`, 'threat')

        // Background email alert (fire-and-forget)
        fetch(`${API_BASE}/usb/alert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            deviceLabel: 'Background Security Monitor',
            files: recent
              .filter((s) => (s.risk === 'Critical' || s.risk === 'High') && s.target)
              .slice(0, 5)
              .map((s) => ({ name: `[${s.risk}] ${s.target}`, size: 0, type: s.type || 'Scan' })),
          }),
        }).catch(() => {})
      } else {
        setStatus('ok')
        addLog('Background scan complete — no new threats', 'ok')
      }
    } catch (err) {
      setStatus('offline')
      addLog(`Scan error: ${err.message}`, 'warn')
    }
  }, [token, showToast])

  // Start polling when token is available
  useEffect(() => {
    if (!token) return
    runScan()
    timerRef.current = setInterval(runScan, POLL_INTERVAL)
    return () => clearInterval(timerRef.current)
  }, [token, runScan])

  const statusIcon = {
    idle:     <Activity size={12} />,
    scanning: <Activity size={12} className="spin" />,
    ok:       <CheckCircle2 size={12} />,
    threat:   <AlertTriangle size={12} />,
    offline:  <WifiOff size={12} />,
  }

  const statusLabel = {
    idle:     'Protection starting…',
    scanning: 'Scanning…',
    ok:       `Protected · Last scan: ${lastScan ? new Date(lastScan).toLocaleTimeString() : '—'}`,
    threat:   `⚠️ ${threatCount} threat(s) found`,
    offline:  'Backend offline · Protection paused',
  }

  const statusClass = { idle: '', scanning: 'scanning', ok: 'ok', threat: 'threat', offline: 'offline' }

  return (
    <div className={`sec-monitor ${statusClass[status] || ''} ${expanded ? 'expanded' : ''}`}>
      <div className="sec-monitor-bar">
        <button
          type="button"
          className="sec-monitor-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label="Security monitor status"
        >
          <Shield size={13} className="sec-shield-icon" />
          {statusIcon[status]}
          <span className="sec-status-text">{statusLabel[status] || 'Protection active'}</span>
          <span className="sec-monitor-label">24/7 PROTECTION</span>
        </button>
        <button
          type="button"
          className="sec-scan-now"
          onClick={runScan}
          disabled={status === 'scanning' || !token}
          title="Run scan now"
        >
          <Activity size={11} /> Scan now
        </button>
      </div>

      {expanded && log.length > 0 && (
        <div className="sec-monitor-log">
          {log.map((entry, i) => (
            <div key={i} className={`sec-log-entry log-${entry.type}`}>
              <time>{entry.time}</time><span>{entry.msg}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
