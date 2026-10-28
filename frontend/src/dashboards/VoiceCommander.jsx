import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Volume2, X, Zap } from 'lucide-react'

/**
 * VoiceCommander — Web Speech API-based voice command system.
 *
 * Supported commands (spoken):
 *   Navigation: "go to [section]", "open [section]", "show [section]"
 *     sections: dashboard, ai assistant, automation, threat intelligence,
 *               security testing, identity, investigation, defense, developer
 *   Actions:   "scan url", "scan code", "new project", "add task",
 *              "create report", "logout", "help"
 *   Control:   "stop listening", "cancel"
 *
 * Props:
 *   onNavigate(dashboardId)   — switch dashboard section
 *   onLegacyNavigate(name)    — navigate legacy section
 *   onOpenModal(modalName)    — open a modal
 *   onLogout()                — trigger logout
 */

const SECTION_MAP = {
  'dashboard': 'main',
  'main dashboard': 'main',
  'home': 'main',
  'ai assistant': 'ai',
  'ai command': 'ai',
  'command center': 'ai',
  'automation': 'automation',
  'automation hub': 'automation',
  'threat': 'threat',
  'threat intelligence': 'threat',
  'security testing': 'security',
  'security lab': 'security',
  'testing lab': 'security',
  'identity': 'identity',
  'identity network': 'identity',
  'network security': 'identity',
  'investigation': 'investigation',
  'investigation center': 'investigation',
  'forensics': 'investigation',
  'defense': 'defense',
  'ai defense': 'defense',
  'incident response': 'defense',
  'developer': 'developer',
  'developer dashboard': 'developer',
}

const NAV_PREFIXES = ['go to ', 'open ', 'show ', 'navigate to ', 'switch to ', 'take me to ']

const MODAL_MAP = {
  'scan url': 'Scan URL',
  'scan a url': 'Scan URL',
  'scan website': 'Scan URL',
  'scan code': 'Scan Code',
  'analyze code': 'Scan Code',
  'analyze file': 'Analyze File',
  'scan file': 'Analyze File',
  'new project': 'New Project',
  'create project': 'New Project',
  'add task': 'Add Task',
  'create task': 'Add Task',
  'new task': 'Add Task',
  'create report': 'Create Report',
  'generate report': 'Create Report',
}

function matchCommand(transcript, assistantName = 'Kiara') {
  let t = transcript.toLowerCase().trim()
  const name = assistantName.toLowerCase().trim()
  const wakePrefix = [`hello ${name}`, `नमस्ते ${name}`, `${name},`, name]
    .find((prefix) => t === prefix || t.startsWith(`${prefix} `) || t.startsWith(`${prefix},`))
  if (wakePrefix) t = t.slice(wakePrefix.length).trim()

  // Navigation
  for (const prefix of NAV_PREFIXES) {
    if (t.startsWith(prefix)) {
      const section = t.slice(prefix.length).trim()
      const id = SECTION_MAP[section]
      if (id) return { type: 'navigate', id, label: section }
    }
  }

  // Direct section names
  const directSection = SECTION_MAP[t]
  if (directSection) return { type: 'navigate', id: directSection, label: t }

  // Modal actions
  const modal = MODAL_MAP[t]
  if (modal) return { type: 'modal', modal, label: t }

  // Special commands
  if (t === 'logout' || t === 'log out' || t === 'sign out') return { type: 'logout', label: t }
  if (t === 'stop' || t === 'stop listening' || t === 'cancel' || t === 'quiet') return { type: 'stop', label: t }
  if (t === 'help' || t === 'what can you do' || t === 'commands') return { type: 'help', label: t }

  return null
}

export default function VoiceCommander({ assistantName = 'Kiara', onNavigate, onLegacyNavigate, onOpenModal, onLogout }) {
  const [active, setActive] = useState(false)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [lastCommand, setLastCommand] = useState(null)
  const [log, setLog] = useState([])
  const [error, setError] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const recognitionRef = useRef(null)

  const supported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const addLog = useCallback((text, type = 'info') => {
    setLog((prev) => [{ text, type, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 19)])
  }, [])

  const executeCommand = useCallback((cmd, raw) => {
    setLastCommand({ cmd, raw, ok: true })
    if (cmd.type === 'navigate') {
      addLog(`Navigating to: ${cmd.label}`, 'success')
      onNavigate?.(cmd.id)
    } else if (cmd.type === 'modal') {
      addLog(`Opening: ${cmd.modal}`, 'success')
      onOpenModal?.(cmd.modal)
    } else if (cmd.type === 'logout') {
      addLog('Logging out…', 'success')
      onLogout?.()
    } else if (cmd.type === 'stop') {
      addLog('Stopped listening.', 'info')
      setListening(false)
      recognitionRef.current?.stop()
    } else if (cmd.type === 'help') {
      addLog('Showing help.', 'info')
      setShowHelp(true)
    }
  }, [addLog, onNavigate, onOpenModal, onLogout])

  const startListening = useCallback(() => {
    if (!supported) { setError('Web Speech API is not supported in this browser. Try Chrome or Edge.'); return }
    setError('')

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onstart = () => { setListening(true); addLog('Microphone active — listening…', 'info') }
    recognition.onend = () => { setListening(false) }
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') {
        setError('Microphone permission denied. Allow microphone access in your browser settings.')
      } else if (event.error !== 'no-speech') {
        setError(`Speech recognition error: ${event.error}`)
      }
      setListening(false)
    }

    recognition.onresult = (event) => {
      let interim = '', final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i]
        if (r.isFinal) final += r[0].transcript
        else interim += r[0].transcript
      }
      setTranscript(final || interim)
      if (final) {
        const cmd = matchCommand(final, assistantName)
        if (cmd) {
          executeCommand(cmd, final)
        } else {
          addLog(`"${final.trim()}" — no matching command`, 'warn')
          setLastCommand({ raw: final, ok: false })
        }
        setTranscript('')
      }
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [supported, addLog, executeCommand, assistantName])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setListening(false)
    addLog('Stopped.', 'info')
  }, [addLog])

  useEffect(() => {
    return () => { recognitionRef.current?.stop() }
  }, [])

  if (!active) {
    return (
      <button
        className="voice-cmd-fab"
        title={`Enable ${assistantName} voice commands`}
        aria-label={`Enable ${assistantName} voice commands`}
        onClick={() => setActive(true)}
      >
        <Mic size={18} />
        <span>Voice</span>
      </button>
    )
  }

  return (
    <div className={`voice-commander ${listening ? 'is-listening' : ''}`} role="dialog" aria-label={`${assistantName} voice command panel`}>
      <div className="voice-cmd-header">
        <span className="voice-cmd-title"><Mic size={15} />{assistantName} Voice Commands</span>
        <div className="voice-cmd-header-actions">
          <button className="voice-icon-btn" title="Help" onClick={() => setShowHelp((v) => !v)}>?</button>
          <button className="voice-icon-btn" title="Close" onClick={() => { stopListening(); setActive(false) }}><X size={14} /></button>
        </div>
      </div>

      {!supported && (
        <div className="voice-cmd-unsupported">
          Web Speech API is not available. Please use Chrome or Edge for voice commands.
        </div>
      )}

      {error && <div className="voice-cmd-error">{error}</div>}

      <div className="voice-cmd-body">
        <button
          className={`voice-mic-btn ${listening ? 'active' : ''}`}
          onClick={listening ? stopListening : startListening}
          disabled={!supported}
          aria-pressed={listening}
          aria-label={listening ? 'Stop listening' : 'Start listening'}
        >
          {listening ? <MicOff size={22} /> : <Mic size={22} />}
          {listening ? 'Stop' : 'Start'}
        </button>

        <div className="voice-cmd-status">
          {listening ? (
            <span className="voice-active-dot"><i /><i /><i /> Listening…</span>
          ) : (
            <span className="voice-inactive">Press Start to listen; background wake-word listening is off</span>
          )}
        </div>

        {transcript && (
          <div className="voice-transcript" aria-live="polite">
            <Volume2 size={12} /> <em>{transcript}</em>
          </div>
        )}

        {lastCommand && (
          <div className={`voice-last-cmd ${lastCommand.ok ? 'ok' : 'fail'}`}>
            {lastCommand.ok
              ? <><Zap size={12} /> Command accepted: {lastCommand.cmd?.label || lastCommand.raw}</>
              : <>✗ Not recognized: "{lastCommand.raw?.trim()}"</>}
          </div>
        )}
      </div>

      {showHelp && (
        <div className="voice-cmd-help">
          <div className="voice-help-title">Available Commands</div>
          <div className="voice-help-grid">
            <div><b>Navigation</b><small>"go to dashboard"<br />"open threat intelligence"<br />"show developer"<br />"security testing"</small></div>
            <div><b>Actions</b><small>"scan url"<br />"scan code"<br />"new project"<br />"add task"<br />"create report"</small></div>
            <div><b>Control</b><small>"stop listening"<br />"logout"<br />"help"</small></div>
          </div>
        </div>
      )}

      {log.length > 0 && (
        <div className="voice-cmd-log">
          {log.map((entry, i) => (
            <div key={i} className={`voice-log-entry log-${entry.type}`}>
              <time>{entry.time}</time><span>{entry.text}</span>
            </div>
          ))}
        </div>
      )}

      {listening && (
        <div className="voice-pulse-ring" aria-hidden="true"><i /><i /><i /></div>
      )}
    </div>
  )
}
