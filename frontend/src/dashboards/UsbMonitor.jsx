import { useCallback, useState } from 'react'
import { AlertTriangle, CheckCircle2, HardDrive, Loader2, ShieldAlert, X } from 'lucide-react'
import { collectDirectoryFiles, usbScanApi } from './usbScanApi.js'

/**
 * UsbMonitor — detects removable drives via File System Access API.
 *
 * Browser sandbox limitations:
 *   - Cannot auto-detect USB plug events (OS-level, outside browser sandbox).
 *   - User must click "Scan Drive" and grant folder access via browser dialog.
 *   - File *names* and *sizes* are read; file *contents* are not sent to backend.
 *   - For true background auto-detection, a native Electron/desktop wrapper is needed.
 */
export default function UsbMonitor({ token, showToast = () => {} }) {
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [supported] = useState(() => (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'showDirectoryPicker' in window
  ))
  const scan = useCallback(async () => {
    if (!supported) {
      setError('File System Access API is not available in this secure browser context. Use Chrome or Edge over HTTPS.')
      return
    }
    setError('')
    setResult(null)

    let dirHandle
    try {
      dirHandle = await window.showDirectoryPicker({ mode: 'read', id: 'usb-scan' })
    } catch (pickerError) {
      if (pickerError?.name !== 'AbortError') {
        setError(`Could not open folder: ${pickerError instanceof Error ? pickerError.message : 'permission was denied.'}`)
      }
      return
    }

    setScanning(true)
    try {
      const files = await collectDirectoryFiles(dirHandle)
      const data = await usbScanApi.scan(dirHandle.name, files, token)
      setResult(data)
      if (data.threats.length > 0 || data.warnings.length > 0) {
        showToast(`⚠️ USB Threat: ${data.threats.length} threat(s) found on ${dirHandle.name}`)
      } else {
        showToast(`No suspicious filenames found in ${data.filesScanned} file(s) on ${dirHandle.name}.`)
      }
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : 'USB scan failed. No result was recorded.')
      setResult(null)
    } finally {
      setScanning(false)
    }
  }, [supported, token, showToast])

  const riskColor = { Critical: '#ff2d3b', High: '#ff6a1a', Medium: '#ffb800', Low: '#22c55e', Unknown: '#8699a8' }

  return (
    <div className="usb-monitor">
      <div className="usb-monitor-header">
        <HardDrive size={18} className="usb-icon" />
        <div>
          <h3>USB / Pen Drive Scanner</h3>
          <p>
            {supported
              ? 'Click "Scan Drive" and select the removable drive folder to check filenames for suspicious patterns.'
              : 'File System Access API requires Chrome or Edge in a secure context.'}
          </p>
        </div>
      </div>

      {!supported && (
        <div className="usb-unsupported">
          <AlertTriangle size={14} /> Full auto-detection requires a desktop app. Browser scan requires Chrome/Edge and user permission.
        </div>
      )}

      <div className="usb-monitor-actions">
        <button type="button" className="usb-scan-btn" onClick={scan} disabled={scanning || !supported}>
          {scanning ? <><Loader2 size={14} className="spin" /> Scanning…</> : <><HardDrive size={14} /> Scan Drive</>}
        </button>
        {result && <button type="button" className="usb-clear-btn" onClick={() => setResult(null)}><X size={13} /></button>}
      </div>

      {error && <div role="alert" className="usb-error"><AlertTriangle size={13} />{error}</div>}

      {result && (
        <div className="usb-result" style={{ '--usb-risk': riskColor[result.risk] || '#8699a8' }}>
          <div className="usb-result-summary">
            <span className="usb-risk-badge">{result.risk}</span>
            <span><b>{result.deviceLabel}</b> · {result.filesScanned} file(s) checked</span>
            {result.emailSent && <span className="usb-email-sent">✓ Alert emailed</span>}
          </div>
          {[...result.threats, ...result.warnings].length > 0 ? (
            <div className="usb-findings">
              {[...result.threats, ...result.warnings].map((finding, index) => (
                <div key={index} className={`usb-finding sev-${finding.severity?.toLowerCase()}`}>
                  <ShieldAlert size={13} /><b>{finding.name}</b><small>{finding.reason}</small>
                </div>
              ))}
            </div>
          ) : (
            <div className="usb-clean"><CheckCircle2 size={14} /> No suspicious filenames detected</div>
          )}
          <div className="usb-note">
            {result.emailSent
              ? 'Alert sent to your registered email.'
              : result.emailNote || 'Configure SMTP in backend .env to enable email alerts.'}
          </div>
        </div>
      )}

      <div className="usb-browser-note">
        <AlertTriangle size={11} />
        <span>
          <b>Browser limitation:</b> Auto-detection on USB plug requires a native desktop app (Electron).
          In the browser, you must manually select the drive folder. Contents are not uploaded — only filenames and sizes are checked.
        </span>
      </div>
    </div>
  )
}
