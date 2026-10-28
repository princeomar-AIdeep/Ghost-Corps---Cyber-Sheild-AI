import { useState } from 'react'
import { Activity, Bot, Braces, ChevronRight, CircleAlert, FileSearch, MessageSquare, Network, Send, Shield, ShieldCheck, Sparkles, WandSparkles, Workflow } from 'lucide-react'
import { isApiConfigured } from '../lib/api.js'

const agentModes = [
  { id: 'assistant', label: 'AI Assistant', icon: Sparkles },
  { id: 'autonomous', label: 'Autonomous Agent', icon: Bot },
  { id: 'generative', label: 'Generative AI', icon: WandSparkles },
  { id: 'productivity', label: 'Productivity', icon: Activity },
]

const availableTools = [
  { label: 'Code Explainer', icon: Braces, description: 'Prepare a chat prompt' },
  { label: 'Report Generator', icon: FileSearch, description: 'Uses reports API' },
  { label: 'Threat Summarizer', icon: Shield, description: 'Prepare a chat prompt' },
  { label: 'Security Assistant', icon: ShieldCheck, description: 'Uses authenticated chat' },
]
const assistantPrompts = {
  'Code Explainer': 'Explain code I paste here, including its purpose and potential security considerations: ',
  'Threat Summarizer': 'Summarize the threat indicator or scan result I paste here; separate verified details from uncertainty: ',
  'Security Assistant': '',
}

function EmptyState({ title, detail }) {
  return <div className="ai-empty-state"><span><CircleAlert size={19} /></span><strong>{title}</strong><p>{detail}</p></div>
}

/**
 * AI Command Center UI from all-dashboards.
 * When chat props are provided, the Assistant mode uses the existing /api/chat flow.
 */
export default function AICommandCenter({
  showToast = () => {},
  chat,
  chatText,
  setChatText,
  submitChat,
  chatLoading = false,
  chatSubmitting = false,
  chatError = '',
  assistantName = 'Kiara',
  clearChat,
  tasks = [],
  tasksLoading = false,
  tasksError = '',
  onOpenTool,
}) {
  const [activeMode, setActiveMode] = useState('assistant')
  const [promptMode, setPromptMode] = useState('assistant')
  const [prompt, setPrompt] = useState('')
  const chatConnected = typeof submitChat === 'function'
  const backendStatus = chatConnected
    ? 'Authenticated chat API connected · agent planning only'
    : isApiConfigured()
      ? 'API base URL set · agent endpoints pending'
      : 'Backend not configured · set VITE_API_BASE_URL'
  const requestIntegration = () => showToast('This action requires an AI service that is not available.')

  const submitPrompt = (event) => {
    event.preventDefault()
    if (!chatConnected || chatSubmitting || chatLoading) return
    const usingSharedChatInput = activeMode === 'assistant' && chatText !== undefined
    const text = (usingSharedChatInput ? chatText : prompt).trim()
    if (!text) return
    const selectedMode = activeMode === 'assistant' ? promptMode : activeMode
    const mode = selectedMode === 'autonomous' ? 'agent_plan' : selectedMode
    void submitChat(text, mode).then((saved) => {
      if (saved && !usingSharedChatInput) setPrompt('')
    })
  }

  const inputValue = activeMode === 'assistant' && chatConnected && chatText !== undefined ? chatText : prompt
  const onInputChange = (event) => {
    if (activeMode === 'assistant' && chatConnected && setChatText) setChatText(event.target.value)
    else setPrompt(event.target.value)
  }

  return <div className="ai-command-page">
    <section className="ai-command-hero">
      <div className="ai-hero-copy"><span className="ai-kicker"><Sparkles size={13} /> CYBER-SHIELD INTELLIGENCE</span><h1>AI Command Center</h1><p>Your intelligent cybersecurity assistant and autonomous agents.</p></div>
      <div className="ai-hero-figure" aria-hidden="true"><span className="ai-orbit ai-orbit-one" /><span className="ai-orbit ai-orbit-two" /><span className="ai-helmet"><i /><b /><em /></span></div>
      <div className="ai-hero-promise">Smarter agents.<br />Safer tomorrow.</div>
    </section>

    <nav className="ai-agent-tabs" aria-label="Agent categories">
      {agentModes.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={activeMode === id ? 'active' : ''} aria-pressed={activeMode === id} onClick={() => { setActiveMode(id); setPromptMode(id) }}><Icon size={14} />{label}</button>)}
    </nav>

    <div className="ai-command-grid">
      <section className="ai-panel ai-assistant-panel">
        <header className="ai-panel-header"><div><span className="ai-live-indicator" /><h2>{agentModes.find((mode) => mode.id === activeMode)?.label}</h2></div><div><span className="ai-connection-label">{chatConnected ? 'CHAT CONNECTED' : isApiConfigured() ? 'API CONFIGURED' : 'NOT CONNECTED'}</span>{chatConnected && clearChat && <button className="ai-text-action" type="button" onClick={() => void clearChat()} disabled={chatLoading || chatSubmitting}>Clear session</button>}</div></header>
        <div className="ai-assistant-body">
          <div className="ai-agent-identity"><span className="ai-agent-avatar"><Bot size={31} /></span><div><strong>{activeMode === 'assistant' ? `${assistantName} Assistant` : activeMode === 'autonomous' ? 'AI Planning Assistant' : 'AI Assistant'}</strong><p>{activeMode === 'autonomous' ? 'Creates a plan only; no tools or execution worker are connected. Review and perform steps yourself.' : activeMode === 'assistant' && chatConnected ? 'Ask about scans, threats, code review, or security workflows.' : chatConnected ? 'Requests use the authenticated chat service. No external actions are performed.' : 'Connect an agent service to start a secure, context-aware conversation.'}</p></div></div>
          {activeMode === 'assistant' && chatConnected ? (
            <div className="ai-chat-thread">
            {chatLoading ? (
              <EmptyState title="Loading conversation" detail="Retrieving this session’s saved messages…" />
            ) : !chat?.length ? (
              <EmptyState title="Start a conversation" detail="Ask about a security concept, scan workflow, or threat indicator." />
            ) : chat.map((x, i) => (
                <div key={i} className={`ai-chat-bubble ${x.from}`}>
                  <b>{x.from === 'you' ? 'You' : 'Assistant'}</b>
                  {x.from === 'ai' && x.model && <small className="ai-chat-model">Model: {x.model}</small>}
                  <p>{x.text}</p>
                </div>
              ))}
              {chatSubmitting && <p role="status">Waiting for the AI provider…</p>}
              {chatError && <p className="form-error" role="alert">{chatError}</p>}
            </div>
          ) : (
            <div className="ai-chat-thread">
              {chatLoading
                ? <EmptyState title="Loading conversation" detail="Retrieving this session’s saved messages…" />
                : !chat?.length
                  ? <EmptyState title="Start a conversation" detail={activeMode === 'autonomous' ? 'Describe the goal to receive a non-executing plan for review.' : 'Send a prompt to the authenticated AI service.'} />
                  : chat.map((x, i) => <div key={i} className={`ai-chat-bubble ${x.from}`}><b>{x.from === 'you' ? 'You' : 'Assistant'}</b>{x.from === 'ai' && x.model && <small className="ai-chat-model">Model: {x.model}</small>}<p>{x.text}</p></div>)}
              {chatSubmitting && <p role="status">Waiting for the AI provider…</p>}
              {chatError && <p className="form-error" role="alert">{chatError}</p>}
            </div>
          )}
        </div>
        <form className="ai-prompt-form" onSubmit={submitPrompt}>
          <input value={inputValue} onChange={onInputChange} aria-label="Ask the AI assistant" placeholder={activeMode === 'autonomous' ? 'Describe a goal for a plan…' : activeMode === 'assistant' && chatConnected ? 'Ask about a threat, scan, or security concept…' : 'Ask the connected assistant…'} disabled={!chatConnected || chatLoading || chatSubmitting} />
          <button aria-label="Send prompt" type="submit" disabled={!chatConnected || chatLoading || chatSubmitting || !inputValue.trim()}>{chatSubmitting ? '…' : <Send size={16} />}</button>
        </form>
      </section>

      <div className="ai-right-column">
        <section className="ai-panel ai-tasks-panel">
          <header className="ai-panel-header"><div><Workflow size={15} /><h2>Agent Tasks</h2></div><button className="ai-text-action" type="button" onClick={() => (onOpenTool ? onOpenTool('Notes & Tasks') : requestIntegration())}>View all <ChevronRight size={13} /></button></header>
          {tasksLoading
            ? <EmptyState title="Loading saved tasks" detail="Fetching tasks owned by your account…" />
            : tasksError
              ? <EmptyState title="Saved tasks unavailable" detail={tasksError} />
            : tasks.length
              ? <div className="automation-draft-list">{tasks.slice(0, 5).map((task) => <div key={task._id}><strong>{task.title}</strong><span>{task.done ? 'Completed' : 'Open'} · {task.due || 'No due date'}</span></div>)}</div>
              : <EmptyState title="No saved tasks" detail="Create tasks from Notes & Tasks. This panel does not represent autonomous agent execution." />}
          <div className="ai-task-footer"><span><Network size={12} /> Saved task service</span><span>No execution worker</span></div>
        </section>

        <section className="ai-panel ai-tools-panel">
          <header className="ai-panel-header"><div><Sparkles size={15} /><h2>AI Tools</h2></div><span className="ai-tools-caption">{chatConnected ? 'Available actions' : 'Connect to enable'}</span></header>
          <div className="ai-tools-grid">{availableTools.map(({ label, icon: Icon, description }) => <button type="button" key={label} onClick={() => {
            if (label === 'Report Generator' && onOpenTool) {
              onOpenTool('Create Report')
            } else if (chatConnected && Object.hasOwn(assistantPrompts, label)) {
              setActiveMode('assistant')
              setPromptMode({
                'Code Explainer': 'code_explainer',
                'Threat Summarizer': 'threat_summarizer',
                'Security Assistant': 'security_assistant',
              }[label])
              const nextPrompt = assistantPrompts[label]
              if (setChatText) setChatText(nextPrompt)
              setPrompt(nextPrompt)
            } else {
              requestIntegration()
            }
          }}><Icon size={19} /><b>{label}</b><small>{description}</small></button>)}</div>
        </section>
      </div>
    </div>

    <footer className="ai-command-footer"><span><span className="ai-status-dot" />{backendStatus}</span><span><MessageSquare size={12} /> Agent data will be loaded from the connected backend</span></footer>
  </div>
}
