import React, { useMemo, useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, AlertTriangle, Archive, ArrowDown, ArrowRight, ArrowUp, Bell, Biohazard, Bot, Bug, Check, CheckSquare, ChevronDown, CircleHelp, Clock3, Code2, FileCode2, FileSearch, FileText, Fingerprint, Folder, FolderOpen, Gauge, Globe2, Home, Link, LockKeyhole, LogOut, Menu, MessageSquare, MoreHorizontal, Network, Plus, Scan, Search, Send, Settings, Shield, ShieldAlert, ShieldCheck, Siren, Sparkles, Upload, UserRound, X, Zap } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import './style.css';
import './dashboards/dashboards.css';
import LandingPage from './LandingPage.jsx';
import AuthPage from './AuthPage.jsx';
import DashboardShell from './dashboards/DashboardShell.jsx';
import { profileApi } from './dashboards/profileService.js';
import { reportsApi } from './dashboards/reportsService.js';
import { automationApi } from './dashboards/automationService.js';
import { chatApi, createSubmissionLock, getOrCreateChatSessionId } from './dashboards/chatService.js';
import { createDashboardDataApi } from './dashboards/dashboardDataApi.js';
import { fileScanApi } from './dashboards/fileScanApi.js';
import { apiRequest } from './lib/api.js';

// API base — reads VITE_API_BASE_URL env var so production deployments work without code changes
const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '');

// ── Static UI config (labels / icons / action definitions — NOT data) ────────
const navItems = [['Dashboard', Home], ['AI Assistant', MessageSquare], ['Security Scan', Scan], ['Vulnerability Scan', Shield], ['Threat Detection', ShieldAlert], ['Fraud Detection', LockKeyhole], ['Digital Forensics', Fingerprint], ['Incident Response', Siren], ['Automation', Network], ['Projects & Files', Folder], ['Notes & Tasks', CheckSquare], ['Reports', FileText], ['Profile', UserRound], ['Settings', Settings], ['Help & Support', CircleHelp]];
const actions = [['Scan a URL', 'Check for threats', Link, 'Scan URL'], ['Scan Code', 'Find vulnerabilities', Code2, 'Scan Code'], ['Analyze File', 'Check for malware', FileSearch, 'Analyze File'], ['Ask AI', 'Get instant help', MessageSquare, 'AI Assistant'], ['Create Report', 'Create a scan summary', FileText, 'Create Report'], ['New Project', 'Organize your work', Folder, 'New Project'], ['Add Task', 'Track your goals', CheckSquare, 'Add Task'], ['Automate', 'Schedule scans', Settings, 'Automate']];

// ── Colour palette for scan risk and threat categories ────────────────────────
const CATEGORY_COLORS = ['#ff474d', '#ff9d12', '#168dff', '#773bff', '#728093'];

// ── Derive live metrics from scans + tasks arrays ─────────────────────────────
function computeMetrics(scans, tasks) {
  const total = scans.length;
  const threats = scans.filter(s => s.risk === 'High' || s.risk === 'Critical').length;
  const vulns = scans.filter(s => s.risk === 'Medium' || s.risk === 'High' || s.risk === 'Critical').length;
  const resolved = tasks.filter(t => t.done).length;
  return [
    { label: 'Scans Performed', value: String(total), trend: total > 0 ? `+${total}` : '0', sub: `${scans.filter(s => s.status === 'complete').length} completed`, icon: Scan, tone: 'cyan' },
    { label: 'Threats Detected', value: String(threats), trend: threats > 0 ? `+${threats}` : '0', sub: `${scans.filter(s => s.risk === 'Critical').length} critical, ${scans.filter(s => s.risk === 'High').length} high`, icon: Biohazard, tone: 'red' },
    { label: 'Vulnerabilities Found', value: String(vulns), trend: vulns > 0 ? `+${vulns}` : '0', sub: `${scans.filter(s => s.risk === 'High' || s.risk === 'Critical').length} high, ${scans.filter(s => s.risk === 'Medium').length} medium`, icon: ShieldCheck, tone: 'amber' },
    { label: 'Tasks Resolved', value: String(resolved), trend: resolved > 0 ? `+${resolved}` : '0', sub: `${tasks.filter(t => !t.done).length} pending`, icon: Check, tone: 'green' },
  ];
}

// ── Build trend chart data from scans grouped by calendar day ─────────────────
function computeTrendData(scans, rangeName) {
  const now = new Date();
  let days;
  if (rangeName === 'Last 7 Days') days = 7;
  else if (rangeName === 'Last 30 Days') days = 30;
  else if (rangeName === 'Last 90 Days') days = 90;
  else days = scans.length > 0 ? Math.ceil((now - new Date(scans[scans.length - 1].createdAt)) / 86400000) + 1 : 7;

  const buckets = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    buckets[key] = { day: key, high: 0, medium: 0, low: 0 };
  }

  scans.forEach(s => {
    const dayKey = new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (buckets[dayKey]) {
      if (s.risk === 'High' || s.risk === 'Critical') buckets[dayKey].high += 1;
      else if (s.risk === 'Medium') buckets[dayKey].medium += 1;
      else buckets[dayKey].low += 1;
    }
  });

  return Object.values(buckets);
}

// ── Build threat categories from scan risk distribution ───────────────────────
function computeCategories(scans) {
  const counts = { 'High Risk': 0, 'Critical': 0, 'Medium Risk': 0, 'Low Risk': 0, 'Clean': 0 };
  scans.forEach(s => {
    if (s.risk === 'Critical') counts['Critical'] += 1;
    else if (s.risk === 'High') counts['High Risk'] += 1;
    else if (s.risk === 'Medium') counts['Medium Risk'] += 1;
    else if (s.risk === 'Low') counts['Low Risk'] += 1;
    else counts['Clean'] += 1;
  });
  return Object.entries(counts)
    .map(([name, value], i) => ({ name, value, color: CATEGORY_COLORS[i] }))
    .filter(c => c.value > 0);
}

// ── Derive recent activity from scan list ─────────────────────────────────────
function computeActivity(scans) {
  return scans.slice(0, 7).map(s => {
    const type = s.type === 'URL' ? 'URL Scan' : s.type === 'Code' ? 'Code Scan' : 'File Analysis';
    const iconType = s.risk === 'High' || s.risk === 'Critical' ? 'alert' : s.type === 'Code' ? 'code' : 'check';
    const ago = (() => {
      const diff = Date.now() - new Date(s.createdAt).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins} min ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
      return `${Math.floor(hrs / 24)} day${Math.floor(hrs / 24) > 1 ? 's' : ''} ago`;
    })();
    return [type + ' ' + (s.status === 'complete' ? 'Completed' : s.status), s.target.slice(0, 60), ago, iconType];
  });
}

// ── Format scan rows for the dashboard table ──────────────────────────────────
function formatScanRow(s) {
  return {
    ...s,
    type: s.type === 'URL' ? 'URL Scan' : s.type === 'Code' ? 'Code Scan' : 'File Analysis',
    date: s.createdAt ? new Date(s.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—',
  };
}

function DashboardApp({ token, onLogout }) {
  const [activeDashboard, setActiveDashboard] = useState(() => (
    ['connected', 'error'].includes(new URLSearchParams(window.location.search).get('github'))
      ? 'developer'
      : 'main'
  ));
  const [page, setPage] = useState('Dashboard');
  const [modal, setModal] = useState('');
  const [search, setSearch] = useState('');
  const [range, setRange] = useState('Last 7 Days');
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [scans, setScans] = useState([]);
  const [chat, setChat] = useState([]);
  const [chatText, setChatText] = useState('');
  const [chatSessionId] = useState(() => getOrCreateChatSessionId());
  const [chatLoading, setChatLoading] = useState(true);
  const [chatSubmitting, setChatSubmitting] = useState(false);
  const [chatError, setChatError] = useState('');
  const [assistantName, setAssistantName] = useState('Kiara');
  const chatSubmissionLock = useRef(null);
  if (!chatSubmissionLock.current) chatSubmissionLock.current = createSubmissionLock();

  useEffect(() => {
    const controller = new AbortController();
    profileApi.getMe({ token, signal: controller.signal })
      .then((result) => {
        const name = result?.user?.assistantName;
        if (typeof name === 'string' && name.trim()) setAssistantName(name.trim());
      })
      .catch(() => {});
    return () => controller.abort();
  }, [token]);
  const [menu, setMenu] = useState('');
  const [notice, setNotice] = useState(false);
  const [selected, setSelected] = useState(null);
  const [reportsVersion, setReportsVersion] = useState(0);
  const [workflowVersion, setWorkflowVersion] = useState(0);
  const [toast, setToast] = useState('');
  const [scansLoading, setScansLoading] = useState(true);
  const [scansError, setScansError] = useState('');
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState('');
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState('');

  // ── Load all core data from backend on mount ──────────────────────────────
  useEffect(() => {
    if (!token) return;

    setScansLoading(true);
    setScansError('');
    setTasksLoading(true);
    setTasksError('');
    setProjectsLoading(true);
    setProjectsError('');

    const dashboardDataApi = createDashboardDataApi((endpoint) => apiRequest(endpoint, { token }));
    const requests = [
      dashboardDataApi.loadProjects().then(setProjects),
      dashboardDataApi.loadTasks().then(setTasks),
      dashboardDataApi.loadScans().then(setScans),
    ];
    requests[0].then(
      () => setProjectsLoading(false),
      () => setProjectsLoading(false)
    );
    Promise.allSettled(requests).then((results) => {
      const projectResult = results[0];
      if (projectResult.status === 'rejected') {
        const error = projectResult.reason;
        console.error('Dashboard projects load error:', error);
        setProjectsError(error instanceof Error ? error.message : 'Projects could not be loaded.');
      }

      const scanResult = results[2];
      if (scanResult.status === 'rejected') {
        const error = scanResult.reason;
        console.error('Dashboard scan load error:', error);
        setScansError(error instanceof Error ? error.message : 'Scan data could not be loaded.');
      }
      setScansLoading(false);
      const taskResult = results[1];
      if (taskResult.status === 'rejected') {
        const error = taskResult.reason;
        setTasksError(error instanceof Error ? error.message : 'Saved tasks could not be loaded.');
      } else {
        setTasksError('');
      }
      setTasksLoading(false);
    });
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    const controller = new AbortController();
    setChatLoading(true);
    setChatError('');
    chatApi.history(chatSessionId, { token, signal: controller.signal })
      .then((messages) => {
        if (!Array.isArray(messages)) throw new Error('Chat history response must be an array.');
        setChat(messages
          .filter((message) => ['user', 'assistant'].includes(message?.role) && typeof message.content === 'string')
          .map((message) => ({ from: message.role === 'user' ? 'you' : 'ai', text: message.content, model: message.model })));
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') {
          setChatError(error instanceof Error ? error.message : 'Chat history could not be loaded.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setChatLoading(false);
      });
    return () => controller.abort();
  }, [chatSessionId, token]);

  // ── Derived / computed values ──────────────────────────────────────────────
  const metrics = useMemo(() => computeMetrics(scans, tasks), [scans, tasks]);
  const trendChartData = useMemo(() => computeTrendData(scans, range), [scans, range]);
  const categories = useMemo(() => computeCategories(scans), [scans]);
  const totalThreatCount = useMemo(() => categories.reduce((a, c) => a + c.value, 0), [categories]);
  const activityFeed = useMemo(() => computeActivity(scans), [scans]);
  const formattedScans = useMemo(() => scans.map(formatScanRow), [scans]);

  const notify = (s) => { setToast(s); setTimeout(() => setToast(''), 2600) };
  const matching = useMemo(() => {
    if (!search.trim()) return [];
    const term = search.toLowerCase();
    return [
      ...navItems.map(([label]) => ({ label, type: 'section' })),
      ...scans.map(x => ({ label: x.target, type: 'scan' })),
      ...tasks.map(x => ({ label: x.title, type: 'task' })),
      ...projects.map(x => ({ label: x.title, type: 'project' })),
    ].filter(x => x.label.toLowerCase().includes(term)).slice(0, 6);
  }, [search, scans, tasks, projects]);

  const saveTasks = async (next) => {
    const changed = next.find((task) => {
      const current = tasks.find((existing) => existing._id && existing._id === task._id);
      return current && (
        current.done !== task.done ||
        current.title !== task.title ||
        current.due !== task.due
      );
    });
    if (!changed) {
      setTasks(next);
      return true;
    }

    const current = tasks.find((task) => task._id === changed._id);
    const updates = {};
    for (const key of ['done', 'title', 'due']) {
      if (current[key] !== changed[key]) updates[key] = changed[key];
    }

    try {
      const saved = await createDashboardDataApi(
        (endpoint, options) => apiRequest(endpoint, { ...options, token })
      ).updateTask(changed._id, updates);
      setTasks(next.map((task) => task._id === saved._id ? saved : task));
      return true;
    } catch (error) {
      notify(`Task update failed: ${error instanceof Error ? error.message : 'The backend did not confirm the update.'}`);
      return false;
    }
  };

  const selectDashboard = (id) => { setActiveDashboard(id); setMenu(''); setSearch(''); if (id === 'main') setPage('Dashboard'); };
  const navigate = (name) => {
    setMenu(''); setSearch('');
    if (name === 'Dashboard') { selectDashboard('main'); return; }
    if (name === 'AI Assistant') { selectDashboard('ai'); return; }
    if (name === 'Automation') { selectDashboard('automation'); return; }
    setPage(name); setActiveDashboard('legacy');
  };

  const submitChat = async (text = chatText, mode = 'assistant') => {
    if (!text.trim()) return false;
    return chatSubmissionLock.current.run(async () => {
      const userMsg = text.trim();
      setChat(c => [...c, { from: 'you', text: userMsg }]);
      setChatText('');
      setChatError('');
      setChatSubmitting(true);

      try {
        const data = await chatApi.send({
          message: userMsg,
          sessionId: chatSessionId,
          mode,
        }, { token });
        if (typeof data?.reply !== 'string' || !data.reply.trim()) {
          throw new Error('The AI service returned an invalid response.');
        }
        setChat(c => [...c, { from: 'ai', text: data.reply, model: data.model }]);
        return true;
      } catch (error) {
        setChatText(userMsg);
        setChatError(error instanceof Error ? error.message : 'AI service unavailable. Please try again later.');
        return false;
      } finally {
        setChatSubmitting(false);
      }
    });
  };

  const clearChat = async () => {
    if (chatSubmissionLock.current.pending || chatLoading) return false;
    setChatError('');
    setChatLoading(true);
    try {
      await chatApi.clearHistory(chatSessionId, { token });
      setChat([]);
      return true;
    } catch (error) {
      setChatError(error instanceof Error ? error.message : 'Chat history could not be cleared.');
      return false;
    } finally {
      setChatLoading(false);
    }
  };

  const action = (name) => { if (name === 'AI Assistant') { navigate(name); return } setModal(name) };
  const doSearch = (item) => {
    if (item.type === 'section') navigate(item.label);
    else if (item.type === 'scan') { setSelected(scans.find(x => x.target === item.label)); setModal('Scan details'); }
    else if (item.type === 'task') navigate('Notes & Tasks');
    else navigate('Projects & Files');
    setSearch('');
  };

  const dashboardProps = {
    metrics, actions, range, setRange,
    scans: formattedScans, setScans, setModal, setSelected,
    tasks, saveTasks, projects, setProjects,
    chat, setChat, chatText, setChatText, submitChat, chatSubmitting, chatError,
    action, notify, navigate, menu, setMenu,
    trendChartData, categories, totalThreatCount, activityFeed,
    scansLoading, scansError, tasksLoading, tasksError,
    projectsLoading, projectsError,
  };
  const sectionProps = {
    page, navigate, setModal,
    tasks, saveTasks, projects, setProjects,
    scans: formattedScans, setScans,
    chat, chatText, setChatText, submitChat,
    notify,
    reportsVersion,
    onAssistantNameChange: setAssistantName,
  };

  return <>
    <DashboardShell
      activeDashboard={activeDashboard}
      onSelectDashboard={selectDashboard}
      search={search}
      onSearchChange={(e) => setSearch(e.target.value)}
      searchResults={matching}
      onSearchSelect={doSearch}
      notificationsOpen={menu === 'notifications'}
      onToggleNotifications={() => setMenu(menu === 'notifications' ? '' : 'notifications')}
      notice={notice}
      onMarkNotificationsRead={() => { setNotice(false); setMenu('') }}
      accountOpen={menu === 'account'}
      onToggleAccount={() => setMenu(menu === 'account' ? '' : 'account')}
      onLogout={() => { setMenu(''); onLogout() }}
      onNavigateLegacy={navigate}
      onOpenModal={setModal}
      workflowVersion={workflowVersion}
      showToast={notify}
      toast={toast}
      onDismissToast={() => setToast('')}
      chat={chat}
      chatText={chatText}
      setChatText={setChatText}
      submitChat={submitChat}
      assistantName={assistantName}
      chatLoading={chatLoading}
      chatSubmitting={chatSubmitting}
      chatError={chatError}
      clearChat={clearChat}
      tasks={tasks}
      tasksLoading={tasksLoading}
      tasksError={tasksError}
      renderMain={() => <Dashboard {...dashboardProps} />}
      renderLegacySection={() => <SectionPage {...sectionProps} />}
      token={token}
      projects={projects}
      projectsLoading={projectsLoading}
      projectsError={projectsError}
    />
    {modal && <Modal {...{
      modal, setModal, selected, setSelected,
      notify, setProjects, projects, setTasks, tasks, saveTasks,
      setScans, scans: formattedScans, token,
      rawScans: scans, setRawScans: setScans,
      onReportCreated: () => setReportsVersion((version) => version + 1),
      onWorkflowCreated: () => setWorkflowVersion((version) => version + 1),
    }} />}
  </>
}

function Dashboard(p) {
  const [activityAll, setActivityAll] = useState(false);
  const trend = p.trendChartData || [];
  const cats = p.categories || [];
  const metricsLoading = p.scansLoading || p.tasksLoading;
  const metricsError = p.scansError || p.tasksError;

  return <div className="dashboard-grid">
    <section className="center-col">
      <div className="hero">
        <div className="hero-copy">
          <div className="welcome">Cyber Shield AI</div>
          <h1>Security Workspace</h1>
          <p>Your AI-powered cybersecurity agent is ready to help you<br className="desktop-break" /> detect threats, analyze risks and keep your digital world safe.</p>
          <div className="hero-buttons">
            <button className="primary" onClick={() => p.action('Scan URL')}>New Security Scan <ArrowRight size={17} /></button>
            <button className="secondary" onClick={() => p.navigate('AI Assistant')}><MessageSquare size={16} />Chat with AI</button>
          </div>
        </div>
        <div className="hero-quote">"Smarter Security<br /> for a Safer Tomorrow."<span /></div>
      </div>

      {/* ── Metrics row ── */}
      <div className="metrics">
        {p.metrics.map(({ label, value, trend, sub, icon: Icon, tone }) => (
          <article className="metric" key={label}>
            <div className={'metric-icon ' + tone}><Icon size={29} /></div>
            <div className="metric-content">
              <div>{label}</div>
              <div className="metric-value">
                {metricsLoading ? <span className="metric-loading">—</span> : value}
                <span className={tone}>
                  {trend.startsWith('+') ? <ArrowUp size={14} /> : <ArrowDown size={14} />} {trend.replace(/^[+-]/, '')}
                </span>
              </div>
              <small>{metricsLoading ? 'Loading…' : metricsError ? 'Unavailable' : sub}</small>
            </div>
          </article>
        ))}
      </div>

      {/* ── Charts row ── */}
      <div className="row charts-row">
        <section className="panel quick-panel">
          <SectionTitle title="Quick Actions" />
          <div className="quick-grid">
            {p.actions.map(([title, sub, Icon, act]) => (
              <button key={title} className="quick-card" onClick={() => p.action(act)}><Icon size={24} /><b>{title}</b><small>{sub}</small></button>
            ))}
          </div>
        </section>

        <section className="panel overview-panel">
          <div className="section-title">
            <h2>Threat Overview</h2>
            <select value={p.range} onChange={e => p.setRange(e.target.value)}>
              <option>Last 7 Days</option><option>Last 30 Days</option><option>Last 90 Days</option>
            </select>
          </div>
          {p.scansError ? (
            <div className="chart-empty">Backend offline — trend data unavailable</div>
          ) : trend.length > 0 && trend.some(d => d.high + d.medium + d.low > 0) ? (
            <div className="chart-area">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 12, right: 7, left: -22, bottom: 0 }}>
                  <CartesianGrid stroke="#102b3c" />
                  <XAxis dataKey="day" stroke="#8699a8" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                  <YAxis stroke="#8699a8" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: '#071723', border: '1px solid #1b4359', borderRadius: 7, fontSize: 11 }} />
                  <Line type="monotone" dataKey="high" stroke="#ff424b" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="medium" stroke="#ff9c12" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="low" stroke="#269eff" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="chart-empty">{p.scansLoading ? 'Loading scan trend…' : 'No scans yet — run your first scan to see trend data.'}</div>
          )}
          <div className="chart-legend"><span className="red">High</span><span className="orange">Medium</span><span className="blue">Low</span></div>
        </section>
      </div>

      {/* ── Scans + Categories row ── */}
      <div className="row scans-row">
        <section className="panel scan-panel">
          <div className="section-title">
            <h2>Recent Scans</h2>
            <button className="text-link" onClick={() => p.navigate('Security Scan')}>View All</button>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr>{['Type', 'Target', 'Risk Level', 'Status', 'Date'].map(x => <th key={x}>{x}</th>)}</tr></thead>
              <tbody>
                {p.scansLoading ? (
                  <tr><td colSpan="5" className="empty-cell">Loading scans…</td></tr>
                ) : p.scansError ? (
                  <tr><td colSpan="5" className="empty-cell">Backend offline — scan data unavailable.</td></tr>
                ) : p.scans.length > 0 ? (
                  p.scans.slice(0, 4).map((x, i) => (
                    <tr key={x._id || i} onClick={() => { p.setSelected(x); p.setModal('Scan details') }}>
                      <td><span className="type-icon">{x.type === 'URL Scan' ? <Globe2 size={13} /> : x.type === 'Code Scan' ? <Code2 size={13} /> : <FileText size={13} />}</span>{x.type}</td>
                      <td>{x.target}</td>
                      <td><span className={'badge ' + (x.risk || 'unknown').toLowerCase()}><i /> {x.risk || '—'}</span></td>
                      <td><span className="status"><i /> {x.status}</span></td>
                      <td>{x.date}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan="5" className="empty-cell">No scans yet. Start your first security scan above.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel categories-panel">
          <SectionTitle title="Threat Categories" />
          {cats.length > 0 ? (
            <div className="category-layout">
              <div className="donut">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={cats} dataKey="value" innerRadius="64%" outerRadius="98%" paddingAngle={1} stroke="none">
                      {cats.map(x => <Cell key={x.name} fill={x.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#071723', border: '1px solid #1b4359', borderRadius: 7, fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-center"><strong>{p.totalThreatCount}</strong><small>Total Scans</small></div>
              </div>
              <div className="category-legend">
                {cats.map(x => <div key={x.name}><i style={{ background: x.color }} /><span>{x.name}</span><b>{x.value} <small>({Math.round(x.value / p.totalThreatCount * 100)}%)</small></b></div>)}
              </div>
            </div>
          ) : (
            <div className="category-empty">{p.scansLoading ? 'Loading…' : p.scansError ? 'Unavailable' : 'No scan data yet.'}</div>
          )}
        </section>
      </div>

      {/* ── Projects + Tasks row ── */}
      <div className="row bottom-row">
        <section className="panel projects-panel">
          <div className="section-title">
            <h2>Active Projects</h2>
            <button className="text-link" onClick={() => p.navigate('Projects & Files')}>View All</button>
          </div>
          <div className="project-grid">
            {p.projectsLoading ? (
              <div className="empty-cell">Loading projects…</div>
            ) : p.projectsError ? (
              <div className="empty-cell" role="alert">Projects could not be loaded.</div>
            ) : p.projects.length > 0 ? (
              p.projects.slice(0, 3).map((x, i) => (
                <div className="project-card" key={x._id || i} onClick={() => p.navigate('Projects & Files')}>
                  <Folder size={23} />
                  <div>
                    <b>{x.title}</b>
                    <small>{x.updatedAt ? (x.updated || `Updated ${new Date(x.updatedAt).toLocaleDateString()}`) : 'Saved in MongoDB'}</small>
                  </div>
                  <button className="tiny-more" onClick={e => { e.stopPropagation(); p.setMenu(p.menu === `project${i}` ? '' : `project${i}`) }}><MoreHorizontal size={17} /></button>
                  {p.menu === `project${i}` && <div className="mini-menu"><button onClick={e => { e.stopPropagation(); p.setMenu(''); p.setSelected(x); p.setModal('Edit Project') }}>Edit</button><button onClick={e => { e.stopPropagation(); p.setMenu(''); p.setSelected(x); p.setModal('Delete Project') }}>Delete</button></div>}
                </div>
              ))
            ) : (
              <div className="empty-cell">No projects yet. Create your first project above.</div>
            )}
          </div>
        </section>

        <section className="panel tasks-panel">
          <div className="section-title">
            <h2>Tasks</h2>
            <button className="text-link" onClick={() => p.navigate('Notes & Tasks')}>View All</button>
            <button className="add-small" onClick={() => p.setModal('Add Task')}><Plus size={13} /> Add Task</button>
          </div>
          <div className="task-list">
            {p.tasksLoading ? (
              <div className="empty-cell">Loading tasks…</div>
            ) : p.tasksError ? (
              <div className="empty-cell" role="alert">Saved tasks could not be loaded.</div>
            ) : p.tasks.length > 0 ? (
              p.tasks.slice(0, 4).map((t, i) => (
                <label className={'task ' + (t.done ? 'done' : '')} key={t._id || i}>
                  <input type="checkbox" checked={t.done} onChange={e => p.saveTasks(p.tasks.map((v, j) => i === j ? { ...v, done: e.target.checked } : v))} />
                  <span className="fake-check">{t.done && <Check size={12} />}</span>
                  <span className="task-name">{t.title}</span>
                  <small>{t.due}</small>
                </label>
              ))
            ) : (
              <div className="empty-cell">No tasks yet. Add your first task above.</div>
            )}
          </div>
        </section>
      </div>
    </section>

    {/* ── Right column ── */}
    <aside className="right-col">
      <section className="panel assistant-panel">
        <div className="section-title"><h2>AI Assistant</h2></div>
        <div className="assistant-welcome">
          <img src="/assets/ai-assistant-avatar.png" alt="" />
          <div><b>Hello! 👋</b><p>I can help you with security scans, code analysis, threat investigation and more. What would you like to do?</p></div>
        </div>
        <div className="suggestions">
          {[['Explain a threat', MessageSquare], ['Scan a URL', Link], ['Review my code', CheckSquare], ['Generate a report', FileText]].map(([x, I]) => (
            <button key={x} onClick={() => x === 'Scan a URL' ? p.action('Scan URL') : x === 'Generate a report' ? p.action('Create Report') : p.navigate('AI Assistant')}><I size={13} />{x}</button>
          ))}
        </div>
        <form className="chat-entry" onSubmit={e => { e.preventDefault(); p.submitChat(p.chatText) }}>
          <input placeholder="Ask me anything..." value={p.chatText} onChange={e => p.setChatText(e.target.value)} />
          <button aria-label="Send message"><Send size={17} /></button>
        </form>
      </section>

      <section className="panel activity-panel">
        <div className="section-title">
          <h2>Recent Activity</h2>
          <button className="text-link" onClick={() => setActivityAll(!activityAll)}>{activityAll ? 'Show Less' : 'View All'}</button>
        </div>
        <div className="activity-list">
          {p.scansLoading ? (
            <div className="empty-cell">Loading activity…</div>
          ) : p.activityFeed.length > 0 ? (
            (activityAll ? p.activityFeed : p.activityFeed.slice(0, 5)).map(([title, desc, time, type], i) => (
              <div className="activity" key={i}>
                <div className={'activity-icon ' + type}>
                  {type === 'check' ? <Check size={16} /> : type === 'code' ? <Code2 size={17} /> : type === 'alert' ? <Bell size={16} /> : type === 'file' ? <FileText size={16} /> : <LockKeyhole size={15} />}
                </div>
                <div className="activity-copy"><b>{title}</b><small>{desc}</small></div>
                <time>{time}</time>
              </div>
            ))
          ) : (
            <div className="empty-cell">No activity yet. Run your first scan to see it here.</div>
          )}
        </div>
      </section>

      <section className="globe-panel">
        <img src="/assets/digital-globe-network.png" alt="" />
        <div className="globe-copy"><strong>DETECT<br />ANALYZE<br />RESPOND</strong><small>A SAFER DIGITAL WORLD<br />TOGETHER</small></div>
      </section>
    </aside>
  </div>
}

function SectionTitle({ title }) { return <div className="section-title"><h2>{title}</h2></div> }
function SectionPage(p) {
  const [section, setSection] = useState('Overview');
  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState('');
  const [reportBusyId, setReportBusyId] = useState('');
  const [reportsRefresh, setReportsRefresh] = useState(0);
  const [profile, setProfile] = useState(null);
  const [profileDraft, setProfileDraft] = useState({ displayName: '', avatarUrl: '', assistantName: 'Kiara' });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileStatus, setProfileStatus] = useState('');
  const [profileRefresh, setProfileRefresh] = useState(0);

  useEffect(() => {
    if (p.page !== 'Reports') return undefined;
    const controller = new AbortController();
    let active = true;
    setReportsLoading(true);
    setReportsError('');
    reportsApi.list({ signal: controller.signal })
      .then((result) => {
        if (!active) return;
        if (!Array.isArray(result)) throw new Error('Reports response must be an array.');
        setReports(result);
      })
      .catch((error) => {
        if (!active || error?.name === 'AbortError') return;
        setReportsError(error instanceof Error ? error.message : 'Could not load reports.');
      })
      .finally(() => {
        if (active) setReportsLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [p.page, p.reportsVersion, reportsRefresh]);

  useEffect(() => {
    if (!['Profile', 'Settings'].includes(p.page)) return undefined;
    const controller = new AbortController();
    let active = true;
    setProfileLoading(true);
    setProfileError('');
    profileApi.getMe({ signal: controller.signal })
      .then((result) => {
        if (!active) return;
        if (!result?.user || typeof result.user !== 'object') throw new Error('Profile response is invalid.');
        setProfile(result.user);
        setProfileDraft({
          displayName: result.user.displayName || '',
          avatarUrl: result.user.avatarUrl || '',
          assistantName: result.user.assistantName || 'Kiara',
        });
      })
      .catch((error) => {
        if (!active || error?.name === 'AbortError') return;
        setProfileError(error instanceof Error ? error.message : 'Could not load your profile.');
      })
      .finally(() => {
        if (active) setProfileLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [p.page, profileRefresh]);

  const deleteReport = async (report) => {
    if (!report?._id || !window.confirm(`Delete report "${report.title || 'Untitled'}"? This cannot be undone.`)) return;
    setReportBusyId(report._id);
    setReportsError('');
    try {
      await reportsApi.remove(report._id);
      setReports((current) => current.filter((item) => item._id !== report._id));
      p.notify('Report deleted.');
    } catch (error) {
      setReportsError(error instanceof Error ? error.message : 'Could not delete the report.');
    } finally {
      setReportBusyId('');
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setProfileSaving(true);
    setProfileError('');
    setProfileStatus('');
    try {
      const result = await profileApi.updateMe(profileDraft);
      if (!result?.user || typeof result.user !== 'object') throw new Error('Profile response is invalid.');
      setProfile(result.user);
      setProfileDraft({
        displayName: result.user.displayName || '',
        avatarUrl: result.user.avatarUrl || '',
        assistantName: result.user.assistantName || 'Kiara',
      });
      p.onAssistantNameChange?.(result.user.assistantName || 'Kiara');
      setProfileStatus('Profile saved.');
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Could not save your profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  const descriptions = {
    'AI Assistant': 'Ask questions and get AI-powered security guidance.',
    'Security Scan': 'Submit a URL you are authorized to assess. Results are saved to your account.',
    'Vulnerability Scan': 'Review code or a project package for security vulnerabilities.',
    'Threat Detection': 'Monitor and detect threats from your security scans.',
    'Fraud Detection': 'Organize suspicious transaction or identity signals for review.',
    'Digital Forensics': 'Create careful evidence review records.',
    'Incident Response': 'Track incident response steps and owners.',
    'Automation': 'Configure scan workflows and schedules.',
    'Projects & Files': 'Organize your project work. Changes are saved to MongoDB.',
    'Notes & Tasks': 'Track personal tasks, saved to your account.',
    'Reports': 'Review or generate security reports from your real scan data.',
    'Profile': 'Edit your profile details and preferences.',
    'Settings': 'Adjust dashboard preferences and security controls.',
    'Help & Support': 'Find guidance for using the dashboard.',
  };

  return <div className="section-page">
    <div className="crumb">Cyber Shield AI <span>/</span> {p.page}</div>
    <div className="section-page-head">
      <div><h1>{p.page}</h1><p>{descriptions[p.page] || 'Dashboard workspace'}</p></div>
      {p.page === 'Projects & Files' && <button className="primary compact" onClick={() => p.setModal('New Project')}><Plus size={15} />New Project</button>}
      {p.page === 'Notes & Tasks' && <button className="primary compact" onClick={() => p.setModal('Add Task')}><Plus size={15} />Add Task</button>}
      {p.page === 'Reports' && <button className="primary compact" onClick={() => p.setModal('Create Report')}><FileText size={15} />New Report</button>}
    </div>
    <div className="section-tabs">
      <button className={section === 'Overview' ? 'active' : ''} onClick={() => setSection('Overview')}>Overview</button>
      <button className={section === 'Details' ? 'active' : ''} onClick={() => setSection('Details')}>Details</button>
    </div>
    <div className="section-body">
      {p.page === 'Security Scan' ? (
        <div className="scan-overview">
          <div className="scan-overview-header"><h3>Your Scans</h3><button className="primary compact" onClick={() => p.setModal('Scan URL')}>+ New Scan</button></div>
          {p.scans.length > 0 ? (
            <div className="table-scroll"><table><thead><tr>{['Type','Target','Risk','Status','Date'].map(x => <th key={x}>{x}</th>)}</tr></thead><tbody>
              {p.scans.map((x,i) => <tr key={x._id||i}><td>{x.type}</td><td>{x.target}</td><td><span className={'badge '+(x.risk||'unknown').toLowerCase()}><i/>{x.risk||'—'}</span></td><td>{x.status}</td><td>{x.date}</td></tr>)}
            </tbody></table></div>
          ) : <p className="empty-cell">No scans yet.</p>}
        </div>
      ) : p.page === 'Projects & Files' ? (
        <div className="project-grid">
          {p.projects.length > 0 ? p.projects.map((x,i) => <div className="project-card" key={x._id||i}><Folder size={23}/><div><b>{x.title}</b><small>{x.updated || (x.updatedAt ? `Updated ${new Date(x.updatedAt).toLocaleDateString()}` : 'Saved')}</small></div></div>) : <p className="empty-cell">No projects yet.</p>}
        </div>
      ) : p.page === 'Notes & Tasks' ? (
        <div className="task-list">
          {p.tasks.length > 0 ? p.tasks.map((t,i) => <label className={'task '+(t.done?'done':'')} key={t._id||i}><input type="checkbox" checked={t.done} onChange={e => p.saveTasks(p.tasks.map((v,j) => i===j ? {...v,done:e.target.checked}:v))}/><span className="fake-check">{t.done&&<Check size={12}/>}</span><span className="task-name">{t.title}</span><small>{t.due}</small></label>) : <p className="empty-cell">No tasks yet.</p>}
        </div>
      ) : p.page === 'Reports' ? (
        <div className="scan-overview">
          <div className="scan-overview-header"><h3>Saved Reports</h3><button type="button" className="button-outline" onClick={() => setReportsRefresh((value) => value + 1)} disabled={reportsLoading}>Refresh</button></div>
          {reportsError && <p className="form-error" role="alert">{reportsError}</p>}
          {reportsLoading
            ? <p className="empty-cell" role="status">Loading saved reports…</p>
            : reports.length === 0
              ? <p className="empty-cell">No saved reports yet. Create a report from your scan data.</p>
              : <div className="table-scroll"><table><thead><tr><th>Title</th><th>Scans</th><th>Findings</th><th>Created</th><th>Summary</th><th>Action</th></tr></thead><tbody>
                {reports.map((report) => <tr key={report._id}>
                  <td>{report.title || 'Untitled report'}</td><td>{Number.isFinite(report.scanCount) ? report.scanCount : '—'}</td><td>{Number.isFinite(report.findingCount) ? report.findingCount : '—'}</td>
                  <td>{report.createdAt ? new Date(report.createdAt).toLocaleString() : '—'}</td><td>{report.summary || '—'}</td>
                  <td><button type="button" className="button-outline" disabled={reportBusyId === report._id} onClick={() => deleteReport(report)}>{reportBusyId === report._id ? 'Deleting…' : 'Delete'}</button></td>
                </tr>)}
              </tbody></table></div>}
        </div>
      ) : p.page === 'Profile' || p.page === 'Settings' ? (
        profileLoading
          ? <p className="empty-cell" role="status">Loading your profile…</p>
          : profileError && !profile
            ? <div><p className="form-error" role="alert">{profileError}</p><button type="button" className="button-outline" onClick={() => setProfileRefresh((value) => value + 1)}>Retry profile load</button></div>
            : profile && <form className="profile-form" onSubmit={saveProfile}>
              <p><strong>Email:</strong> {profile.email}</p><p><strong>Role:</strong> {profile.role}</p>
              {p.page === 'Profile' && <>
                <label className="form-label">Display name<input maxLength={100} value={profileDraft.displayName} onChange={(event) => setProfileDraft((current) => ({ ...current, displayName: event.target.value }))} /></label>
                <label className="form-label">Avatar URL<input type="url" maxLength={2048} value={profileDraft.avatarUrl} onChange={(event) => setProfileDraft((current) => ({ ...current, avatarUrl: event.target.value }))} /></label>
              </>}
              {p.page === 'Settings' && <label className="form-label">Assistant name<input required maxLength={40} value={profileDraft.assistantName} onChange={(event) => setProfileDraft((current) => ({ ...current, assistantName: event.target.value }))} /><small>Used for the assistant’s displayed identity, chat introductions, and voice command prefix while voice commands are active.</small></label>}
              {profileError && <p className="form-error" role="alert">{profileError}</p>}
              {profileStatus && <p role="status">{profileStatus}</p>}
              <button type="submit" className="primary compact" disabled={profileSaving}>{profileSaving ? 'Saving…' : p.page === 'Settings' ? 'Save settings' : 'Save profile'}</button>
            </form>
      ) : (
        <p className="section-placeholder">{p.page} workspace — use the panels above or modals to interact with your data.</p>
      )}
    </div>
  </div>
}

function Modal(p) {
  const [form, setForm] = useState({}), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [scanStage, setScanStage] = useState('');
  const [scanResult, setScanResult] = useState(null);
  useEffect(() => {
    if (p.modal === 'Edit Project' && p.selected) {
      setForm({ Name: p.selected.title || '', Description: p.selected.description || '' });
    }
  }, [p.modal, p.selected]);
  const change = (key, val) => setForm(x => ({ ...x, [key]: val }));
  const close = () => { p.setModal(''); p.setSelected(null) };
  const input = (label, placeholder = '', type = 'text') => <label className="form-label">{label}<input type={type} placeholder={placeholder} value={form[label] || ''} onChange={e => change(label, e.target.value)} /></label>;

  const submit = async e => {
    e.preventDefault();
    setError('');
    const m = p.modal;

    if (m === 'Scan URL') {
      let u; try { u = new URL(form.URL || '') } catch { }
      if (!u || !['http:', 'https:'].includes(u.protocol)) { setError('Enter a valid http or https URL.'); return }
      if (!form.authorized) { setError('Confirm you are authorized to assess this target.'); return }
      setBusy(true);

      try {
        const res = await fetch(`${API_BASE}/scans`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${p.token}` },
          body: JSON.stringify({ type: 'URL', target: (form.URL || '').trim() }),
        });
        const data = await res.json();
        if (res.ok) {
          p.setRawScans(prev => [data, ...prev]);
          p.notify(`Scan complete — Risk: ${data.risk || 'Low'}`);
        } else {
          p.notify(`Scan failed: ${data.error || 'Backend error'}`);
        }
      } catch { p.notify('Backend offline — scan not performed.'); }
      finally { setBusy(false); }

    } else if (m === 'Scan Code') {
      if ((form.Code || '').trim().length < 10) { setError('Add at least 10 characters of code to continue.'); return }
      if (!form.authorized) { setError('Confirm you are authorized to assess this code.'); return }
      setBusy(true);

      try {
        const res = await fetch(`${API_BASE}/scans`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${p.token}` },
          body: JSON.stringify({ type: 'Code', target: (form.Code || '').trim() }),
        });
        const data = await res.json();
        if (res.ok) {
          p.setRawScans(prev => [data, ...prev]);
          p.notify(`Code scan complete — Risk: ${data.risk || 'Low'}`);
        } else { p.notify(`Scan failed: ${data.error || 'Backend error'}`); }
      } catch { p.notify('Backend offline — scan not performed.'); }
      finally { setBusy(false); }

    } else if (m === 'Analyze File') {
      const file = form.file;
      if (!file) { setError('Choose a file first.'); return }

      setBusy(true);
      setError('');
      setScanResult(null);
      try {
        const data = await fileScanApi.scan(file, p.token, setScanStage);
        p.setRawScans((previous) => [data.scan, ...previous]);
        setScanResult(data);
        p.notify(data.status === 'infected'
          ? `Threat detected by ${data.antivirus.engine}.`
          : `No malware detected by ${data.antivirus.engine}; this is not a safety guarantee.`);
      } catch (error) {
        setScanStage(error.state || 'failed');
        setError(error instanceof Error ? error.message : 'Image analysis could not be completed.');
        return;
      } finally {
        setBusy(false);
      }

    } else if (m === 'New Project' || m === 'Edit Project') {
      if (!(form.Name || '').trim()) { setError('Project name is required.'); return }

      if (m === 'New Project') {
        setBusy(true);
        try {
          const res = await fetch(`${API_BASE}/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${p.token}` },
            body: JSON.stringify({ title: form.Name.trim(), description: (form.Description || '').trim() })
          });
          if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
          const saved = await res.json();
          p.setProjects(prev => [saved, ...prev]);
          p.notify('Project saved to MongoDB!');
        } catch (err) { p.notify(`Project save failed: ${err.message}`); }
        finally { setBusy(false); }

      } else {
        const proj = p.selected;
        if (!proj?._id) { setError('Select a project to edit.'); return }
        if (proj?._id) {
          setBusy(true);
          try {
            const res = await fetch(`${API_BASE}/projects/${proj._id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${p.token}` },
              body: JSON.stringify({ title: form.Name.trim(), description: (form.Description || '').trim() }),
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Update failed');
            const updated = await res.json();
            p.setProjects(prev => prev.map(x => x._id === proj._id ? updated : x));
            p.notify('Project updated in MongoDB.');
          } catch (err) { p.notify(`Update failed: ${err.message}`); }
          finally { setBusy(false); }
        }
      }

    } else if (m === 'Add Task' || m === 'Edit Task') {
      if (!(form.Task || '').trim()) { setError('Task name is required.'); return }
      if (m === 'Add Task') {
        setBusy(true);
        try {
          const res = await fetch(`${API_BASE}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${p.token}` },
            body: JSON.stringify({ title: form.Task.trim(), due: form['Due date'] || 'No due date', done: false })
          });
          if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
          const saved = await res.json();
          p.saveTasks([saved, ...p.tasks]);
          p.notify('Task saved to MongoDB!');
        } catch (err) { p.notify(`Task save failed: ${err.message}`); }
        finally { setBusy(false); }
      } else {
        const saved = await p.saveTasks(p.tasks.map((x, i) => i === 0 ? { ...x, title: form.Task.trim() } : x));
        if (saved) p.notify('Task updated.');
      }

    } else if (m === 'Delete Project') {
      if (!form.confirm) { setError('Confirm project deletion to continue.'); return }
      const proj = p.selected;
      if (!proj?._id) { setError('Select a project to delete.'); return }
      if (proj?._id) {
        setBusy(true);
        try {
          const res = await fetch(`${API_BASE}/projects/${proj._id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${p.token}` } });
          if (!res.ok) throw new Error((await res.json()).error || 'Delete failed');
          p.setProjects(prev => prev.filter(x => x._id !== proj._id));
          p.notify('Project deleted from MongoDB.');
        } catch (err) { p.notify(`Delete failed: ${err.message}`); }
        finally { setBusy(false); }
      }

    } else if (m === 'Create Report') {
      setBusy(true);
      try {
        const report = await reportsApi.create({
          title: `Security Report — ${new Date().toLocaleDateString()}`,
        }, { token: p.token });
        if (!report?._id || !Number.isFinite(report.scanCount) || !Number.isFinite(report.findingCount)) {
          throw new Error('The report service returned an invalid response.');
        }
        p.onReportCreated?.();
        p.notify(`Report generated: ${report.title} (${report.scanCount} scans, ${report.findingCount} findings)`);
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Report could not be generated.');
        return;
      }
      finally { setBusy(false); }

    } else if (m === 'Automate') {
      if (!(form['Workflow name'] || '').trim()) { setError('Workflow name is required.'); return }
      setBusy(true);
      try {
        await automationApi.createWorkflowDraft({
          name: form['Workflow name'].trim(),
          frequency: (form.Frequency || 'Weekly').toLowerCase(),
        });
        p.onWorkflowCreated?.();
        p.notify('Workflow draft saved. It is disabled and will not schedule or execute.');
      } catch {
        setError('Workflow draft could not be saved. No automation was scheduled or executed.');
        return;
      } finally { setBusy(false); }
    } else p.notify(`${m} request opened.`);

    close();
  };

  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && close()}>
    <div className="modal">
      <div className="modal-head">
        <div><span className="modal-kicker">Cyber Shield AI</span><h2>{p.modal}</h2></div>
        <button className="icon-button" onClick={close}><X size={19} /></button>
      </div>
      <form onSubmit={submit}>
        <div className="modal-content">
          {p.modal === 'Scan URL' ? <>
            {input('URL', 'https://your-authorized-site.example', 'url')}
            <label className="confirm-check"><input type="checkbox" checked={!!form.authorized} onChange={e => change('authorized', e.target.checked)} /> I'm authorized to assess this target.</label>
            <p className="form-note">The backend analyzes this URL using heuristics and optional AI.</p>
          </> : p.modal === 'Scan Code' ? <>
            <label className="form-label">Code<textarea rows="8" placeholder="Paste code you are authorized to review..." value={form.Code || ''} onChange={e => change('Code', e.target.value)} /></label>
            <label className="confirm-check"><input type="checkbox" checked={!!form.authorized} onChange={e => change('authorized', e.target.checked)} /> I'm authorized to assess this code.</label>
            <p className="form-note">Code is analyzed by the backend for security patterns.</p>
          </> : p.modal === 'Analyze File' ? <>
            <label className="form-label">Choose file<input type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.zip,.rar,.7z,.tar,.gz,.bz2,.xz,.exe,.dll,.msi,.so,.dylib,.class,.js,.py,.sh,.ps1,.bat,.cmd,.php,.html,.xml,.json,.txt" onChange={e => { setScanResult(null); setScanStage(''); change('file', e.target.files?.[0]); }} /></label>
            <p className="form-note">Uploads up to 25 MiB for ClamAV scanning. Files are not executed or stored.</p>
            {scanStage === 'uploading' && <p role="status">Uploading file…</p>}
            {scanStage === 'scanning' && <p role="status">Scanning with antivirus…</p>}
            {scanStage === 'unavailable' && <p className="form-error" role="alert">Scanner unavailable. No clean result was produced.</p>}
            {scanStage === 'failed' && <p className="form-error" role="alert">Scan failed. No clean result was produced.</p>}
            {scanResult && <div role="status">
              <strong>{scanResult.status === 'infected' ? 'Threat Detected' : 'Clean: no malware detected by this engine'}</strong>
              <p>{scanResult.antivirus.engine} {scanResult.antivirus.engineVersion}; signatures {scanResult.antivirus.signatureVersion}</p>
              {scanResult.antivirus.detectionName && <p>Detection: {scanResult.antivirus.detectionName}</p>}
              <p>SHA-256: {scanResult.antivirus.sha256}</p>
              <p>No malware detection is not a guarantee that the file is completely safe.</p>
            </div>}
          </> : p.modal === 'New Project' || p.modal === 'Edit Project' ? <>
            {input('Name', 'Project name')}{input('Description', 'Optional description')}
          </> : p.modal === 'Add Task' || p.modal === 'Edit Task' ? <>
            {input('Task', 'Task name')}{input('Due date', 'e.g. Oct 24')}
          </> : p.modal === 'Delete Project' ? <>
            <p className="form-note warn">This permanently deletes the project from MongoDB.</p>
            <label className="confirm-check"><input type="checkbox" checked={!!form.confirm} onChange={e => change('confirm', e.target.checked)} /> I understand this is permanent.</label>
          </> : p.modal === 'Automate' ? <>
            {input('Workflow name', 'Weekly URL review')}
            <label className="form-label">Intended frequency<select value={form.Frequency || 'Weekly'} onChange={e => change('Frequency', e.target.value)}><option>Manual</option><option>Daily</option><option>Weekly</option><option>Monthly</option></select></label>
            <p className="form-note">This saves a disabled draft only. No targets, actions, schedules, or executions are configured.</p>
          </> : p.modal === 'Create Report' ? <>
            <p className="form-note">Generates a security report from your real scan data.</p>
          </> : p.modal === 'Scan details' && p.selected ? <>
            <p><strong>Type:</strong> {p.selected.type}</p>
            <p><strong>Target:</strong> {p.selected.target}</p>
            <p><strong>Risk:</strong> <span className={'badge ' + (p.selected.risk || 'unknown').toLowerCase()}>{p.selected.risk || '—'}</span></p>
            <p><strong>Status:</strong> {p.selected.status}</p>
            {p.selected.result && <p><strong>Result:</strong><br /><small style={{whiteSpace:'pre-wrap'}}>{p.selected.result}</small></p>}
          </> : null}
          {error && <p className="form-error">{error}</p>}
        </div>
        {p.modal !== 'Scan details' && (
          <div className="modal-foot">
            <button type="button" onClick={close}>Cancel</button>
            <button type="submit" className="primary" disabled={busy || (p.modal === 'Analyze File' && Boolean(scanResult))}>{busy ? (scanStage === 'uploading' ? 'Uploading…' : 'Scanning…') : scanResult ? 'Scanned' : 'Confirm'}</button>
          </div>
        )}
      </form>
    </div>
  </div>
}

function Root() {
  const [token, setToken] = React.useState(() => localStorage.getItem('ca_token'));

  const handleAuth = (tok, _user) => {
    localStorage.setItem('ca_token', tok);
    if (_user) localStorage.setItem('ca_user', JSON.stringify(_user));
    setToken(tok);
  };

  const handleLogout = () => {
    const t = localStorage.getItem('ca_token');
    if (t) {
      fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${t}` },
      }).catch(() => {});
    }
    localStorage.removeItem('ca_token');
    localStorage.removeItem('ca_user');
    setToken(null);
  };

  if (window.location.pathname === '/dashboard') {
    return token
      ? <DashboardApp token={token} onLogout={handleLogout} />
      : <AuthPage onAuthSuccess={handleAuth} />;
  }
  return <LandingPage />;
}

createRoot(document.getElementById('root')).render(<Root />);
