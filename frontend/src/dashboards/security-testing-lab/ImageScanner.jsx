import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileImage, Loader2, Shield, ShieldAlert, Upload, X } from 'lucide-react'
import { fileScanApi } from '../fileScanApi.js'

const RISK_COLOR = { Critical: '#ff2d3b', High: '#ff6a1a', Medium: '#ffb800', Low: '#22c55e', Unknown: '#8699a8' }
const RISK_ICON = { Critical: ShieldAlert, High: ShieldAlert, Medium: AlertTriangle, Low: CheckCircle2, Unknown: Shield }

function RiskBadge({ risk }) {
  const Icon = RISK_ICON[risk] || Shield
  return (
    <span className="img-scan-risk-badge" style={{ '--risk-color': RISK_COLOR[risk] || '#8699a8' }}>
      <Icon size={13} /> {risk}
    </span>
  )
}

export default function ImageScanner({ token, showToast = () => {} }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [scanStage, setScanStage] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const dropRef = useRef(null)
  const previewUrl = useRef(null)
  const scanning = scanStage === 'uploading' || scanStage === 'scanning'

  useEffect(() => () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
  }, [])

  const handleFile = (f) => {
    if (!f) return
    if (f.size > 25 * 1024 * 1024) { setError('File exceeds 25 MiB limit.'); return }
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    previewUrl.current = f.type.startsWith('image/') ? URL.createObjectURL(f) : null
    setFile(f)
    setPreview(previewUrl.current)
    setResult(null)
    setScanStage('')
    setError('')
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  const handleChange = (e) => handleFile(e.target.files?.[0])

  const scan = async () => {
    if (!file) { setError('Select a file first.'); return }
    setError('')
    try {
      const data = await fileScanApi.scan(file, token, setScanStage)
      setResult(data)
      showToast(data.status === 'infected'
        ? `Threat detected by ${data.antivirus.engine}.`
        : `No malware detected by ${data.antivirus.engine}; this is not a safety guarantee.`)
    } catch (scanError) {
      setScanStage(scanError.state || 'failed')
      setError(scanError instanceof Error ? scanError.message : 'File scan failed. No clean result was produced.')
    }
  }

  const reset = () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    previewUrl.current = null
    setFile(null); setPreview(null); setResult(null); setError(''); setScanStage('')
  }

  return (
    <div className="img-scanner">
      <div className="img-scanner-header">
        <FileImage size={20} />
        <div>
          <h2>Antivirus File Scanner</h2>
          <p>ClamAV scans uploaded file bytes. Files are not executed or stored; no malware detection is not a guarantee that a file is safe.</p>
        </div>
      </div>

      {!file ? (
        <div
          ref={dropRef}
          className="img-drop-zone"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => document.getElementById('img-scan-input').click()}
        >
          <Upload size={28} />
          <b>Drop a file here</b>
          <small>Images, PDF, Office, archives, scripts, executables — max 25 MiB</small>
          <input id="img-scan-input" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.zip,.rar,.7z,.tar,.gz,.bz2,.xz,.exe,.dll,.msi,.so,.dylib,.class,.js,.py,.sh,.ps1,.bat,.cmd,.php,.html,.xml,.json,.txt" onChange={handleChange} style={{ display: 'none' }} />
        </div>
      ) : (
        <div className="img-scan-preview-row">
          <div className="img-scan-thumb">
            {preview ? <img src={preview} alt={file.name} /> : <FileImage size={28} aria-hidden="true" />}
          </div>
          <div className="img-scan-file-info">
            <b>{file.name}</b>
            <small>{(file.size / 1024).toFixed(1)} KB · {file.type || 'type determined from content'}</small>
            {!result && (
              <div className="img-scan-actions">
                <button className="img-scan-btn primary" onClick={scan} disabled={scanning}>
                  {scanStage === 'uploading' ? <><Loader2 size={14} className="spin" /> Uploading…</> : scanStage === 'scanning' ? <><Loader2 size={14} className="spin" /> Scanning…</> : <><Shield size={14} /> Scan with ClamAV</>}
                </button>
                <button className="img-scan-btn secondary" onClick={reset} disabled={scanning}><X size={14} /> Remove</button>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="img-scan-error"><AlertTriangle size={14} />{scanStage === 'unavailable' ? 'Scanner Unavailable: ' : 'Scan Failed: '}{error}</div>
      )}

      {result && (
        <div className={`img-scan-result risk-${result.risk?.toLowerCase()}`}>
          <div className="img-scan-result-header">
            <RiskBadge risk={result.antivirus?.verdict === 'infected' ? 'Critical' : 'Low'} />
            <strong>{result.antivirus?.verdict === 'infected' ? 'Threat Detected' : 'No malware detected by this engine'}</strong>
            <span className="img-scan-filename">{result.filename}</span>
            <span className="img-scan-size">{(result.sizeBytes / 1024).toFixed(1)} KB</span>
            <button className="img-scan-btn secondary compact" onClick={reset}><X size={13} /> Scan another</button>
          </div>

          <div className="img-scan-findings">
            <h3>Scan Findings ({result.findings?.length ?? 0})</h3>
            <p>{result.antivirus?.engine} {result.antivirus?.engineVersion} · signature {result.antivirus?.signatureVersion}</p>
            {result.antivirus?.detectionName && <p>Detection: {result.antivirus.detectionName}</p>}
            <p>SHA-256: {result.antivirus?.sha256}</p>
            {result.findings?.map((f, i) => (
              <div key={i} className={`img-finding sev-${f.severity?.toLowerCase()}`}>
                <span className="finding-sev">{f.severity}</span>
                <div>
                  <b>{f.title}</b>
                  <p>{f.detail}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="img-scan-note">
            ClamAV scan · Result saved to scan history. No malware detection is not a safety guarantee.
          </div>
        </div>
      )}
    </div>
  )
}
