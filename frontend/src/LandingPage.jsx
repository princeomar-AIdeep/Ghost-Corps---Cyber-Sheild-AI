import React, { useEffect, useRef, useState } from 'react';
import { Activity, ArrowDown, ArrowRight, ArrowUpRight, Bot, Building2, Check, CheckCircle2, ChevronDown, Code2, FileSearch, Fingerprint, FlaskConical, GraduationCap, Headphones, LockKeyhole, Menu, MessageSquare, Network, ScanSearch, Shield, ShieldAlert, ShieldCheck, Siren, Sparkles, Target, Users, Workflow, X, Zap } from 'lucide-react';
import './landing.css';

const features = [
  { title: 'AI Assistant', description: 'Get answers, explain code, understand threats and work through security questions.', icon: MessageSquare, tone: 'blue' },
  { title: 'Autonomous AI Agent', description: 'Multi-step security tasks with analysis and useful next-step recommendations.', icon: Bot, tone: 'blue' },
  { title: 'Threat Detection', description: 'Review suspicious activity, malicious URLs and unusual behavior.', icon: ShieldAlert, tone: 'red' },
  { title: 'Vulnerability Scan', description: 'Review code, packages and configurations for potential risks.', icon: ShieldCheck, tone: 'amber' },
  { title: 'Fraud Detection', description: 'Organize suspicious transaction and account activity for review.', icon: Fingerprint, tone: 'violet' },
  { title: 'Digital Forensics', description: 'Investigate incidents with evidence, context and clear timelines.', icon: ScanSearch, tone: 'cyan' },
  { title: 'Incident Response', description: 'Coordinate response workflows and containment recommendations.', icon: Siren, tone: 'violet' },
  { title: 'Productivity Tools', description: 'Keep notes, tasks, projects and security work organized.', icon: Workflow, tone: 'cyan' },
  { title: 'Privacy & Zero Trust', description: 'Keep privacy in view with a security-first approach to access.', icon: LockKeyhole, tone: 'green' },
  { title: 'Secure Application', description: 'Build with practical security guidance throughout the development process.', icon: Code2, tone: 'blue' },
];

const stages = [
  { n: '01', label: 'DETECT', title: 'Understand the signal', body: 'Bring a question, URL, code sample or suspicious event into one focused workspace.', icon: Target },
  { n: '02', label: 'ANALYZE', title: 'Build the context', body: 'Review evidence, examine possible risks and make the reasoning easier to follow.', icon: ScanSearch },
  { n: '03', label: 'RESPOND', title: 'Choose a next step', body: 'Get clear recommendations and keep people in control of consequential actions.', icon: ShieldCheck },
];

const audiences = [
  { title: 'Students & Learners', text: 'Learn cybersecurity, scan project code and get AI support.', icon: GraduationCap },
  { title: 'Developers', text: 'Review code for vulnerabilities and improve security practices.', icon: Code2 },
  { title: 'Security Analysts', text: 'Investigate incidents and coordinate response workflows.', icon: Users },
  { title: 'Organizations', text: 'Protect digital assets with AI-assisted security workflows.', icon: Building2 },
  { title: 'Researchers', text: 'Explore indicators and organize security research.', icon: FlaskConical },
  { title: 'Hackathons & Projects', text: 'Build, test and present practical security ideas.', icon: Zap },
];

const plans = [
  { name: 'Free', audience: 'Perfect for students and personal use', price: '$0', cadence: '/ month', items: ['AI Assistant (basic)', 'Limited scans', 'Basic reports', 'Community support'], action: 'Get Started', kind: 'free' },
  { name: 'Pro', audience: 'For developers and security professionals', price: '$9', cadence: '/ month', items: ['Advanced scans', 'Vulnerability detection', 'Threat intelligence', 'Priority support', 'More automation tools'], action: 'Get Started', kind: 'pro', popular: true },
  { name: 'Enterprise', audience: 'For teams and organizations', price: 'Custom', cadence: '', items: ['All Pro features', 'Team management', 'Advanced automation', 'Custom integrations', 'Dedicated support'], action: 'Contact Sales', kind: 'enterprise' },
];

function LandingPage() {
  const [isAuthenticated] = useState(() =>
    Boolean(localStorage.getItem('ca_token'))
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState('');
  const [sent, setSent] = useState(false);
  const [introVisible, setIntroVisible] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [introLeaving, setIntroLeaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', organization: '', message: '' });
  const dialogRef = useRef(null);
  const firstField = useRef(null);

  useEffect(() => {
    document.title = 'Cyber Shield AI | AI Cybersecurity Platform';
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (modal && !dialog.open) dialog.showModal();
    if (!modal && dialog.open) dialog.close();
    if (modal) firstField.current?.focus();
  }, [modal]);

  useEffect(() => {
    if (!introVisible) return;
    const leaveTimer = window.setTimeout(() => setIntroLeaving(true), 2100);
    const removeTimer = window.setTimeout(() => setIntroVisible(false), 2600);
    return () => { window.clearTimeout(leaveTimer); window.clearTimeout(removeTimer); };
  }, []);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
    const targets = document.querySelectorAll('.landing-shell main > section:not(.landing-hero), .feature-card, .stage-card, .audience-card, .pricing-card, .agent-visual, .agent-copy, .closing-cta .cta-content');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -36px 0px' });

    targets.forEach((element, index) => {
      element.classList.add('scroll-reveal');
      element.style.setProperty('--reveal-delay', `${Math.min(index % 5, 4) * 65}ms`);
      observer.observe(element);
    });
    return () => observer.disconnect();
  }, []);

  const open = (kind) => { setSent(false); setError(''); setForm({ name: '', email: '', organization: '', message: '' }); setModal(kind); };
  const close = () => { setModal(''); setError(''); };
  const update = (key) => (event) => setForm((old) => ({ ...old, [key]: event.target.value }));
  const submit = (event) => {
    event.preventDefault();
    setError('');
    if (!form.email.trim() || !/^\S+@\S+\.\S+$/.test(form.email)) { setError('Enter a valid email address to continue.'); return; }
    if (modal === 'enterprise' && !form.message.trim()) { setError('Add a short message so the contact flow is complete.'); return; }
    setSent(true);
  };
  const dashboard = () => { window.location.href = '/dashboard'; };

  return <div className="landing-shell">
    {introVisible && <div className={`intro-screen${introLeaving ? ' is-leaving' : ''}`} role="status" aria-live="polite">
      <div className="intro-grid" aria-hidden="true" /><div className="intro-crosshair" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="intro-center"><div className="intro-orbit" aria-hidden="true"><i /><i /><i /></div><img className="intro-logo" src="/assets/cyber-shield-ai-guardian-emblem.png" alt="Cyber-Shield AI Guardian Emblem" /><div className="intro-status"><span className="intro-dot" /> INITIALIZING INTERFACE</div><div className="intro-progress"><span /></div><div className="intro-checks" aria-hidden="true"><span>VISUAL LAYER</span><span>DEMO MODE</span><span>READY</span></div></div>
      <button className="intro-skip" onClick={() => { setIntroLeaving(true); window.setTimeout(() => setIntroVisible(false), 350); }}>Skip intro <ArrowRight size={13} /></button>
      <span className="intro-corner intro-corner-tl" aria-hidden="true">CAI / 01</span><span className="intro-corner intro-corner-br" aria-hidden="true">SECURITY WORKSPACE</span>
    </div>}
    <header className="site-header">
      <a href="#home" className="site-brand" aria-label="Cyber Shield AI home"><img src="/assets/cyber-shield-ai-logo.png" alt="Cyber Shield AI" /></a>
      <button className="mobile-nav-toggle" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} aria-controls="site-navigation" onClick={() => setMenuOpen((v) => !v)}>{menuOpen ? <X /> : <Menu />}</button>
      <nav id="site-navigation" className={menuOpen ? 'site-nav is-open' : 'site-nav'} aria-label="Main navigation">
        <a href="#home" onClick={() => setMenuOpen(false)}>Home</a><a href="#features" onClick={() => setMenuOpen(false)}>Features</a><a href="#use-cases" onClick={() => setMenuOpen(false)}>Use Cases</a><a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a><a href="#about" onClick={() => setMenuOpen(false)}>About</a>
      </nav>
      <div className="header-actions"><button className="button button-quiet button-small" onClick={dashboard}>Dashboard</button><button className="button button-primary button-small" onClick={dashboard}>{isAuthenticated ? 'Open Dashboard' : 'Get Started'} <ArrowRight size={14} /></button></div>
    </header>

    <main>
      <section id="home" className="landing-hero">
        <div className="hero-backdrop" aria-hidden="true" />
        <div className="hero-gridmark" aria-hidden="true" />
        <div className="hero-content">
          <span className="eyebrow"><span className="eyebrow-pulse" /> AI-Powered Cybersecurity Platform</span>
          <h1>Smarter <span>Security</span><br />for a Safer<br />Tomorrow.</h1>
          <p>Cyber Shield AI helps you identify potential threats, analyze security risks and coordinate a more confident response.</p>
          <div className="hero-ctas"><button className="button button-primary" onClick={dashboard}>{isAuthenticated ? 'Open Dashboard' : 'Get Started'} <ArrowRight size={17} /></button><button className="button button-outline" onClick={dashboard}><span className="play-icon">▶</span> View Demo</button></div>
        </div>
        <div className="hero-mantra"><span>DETECT</span><span>ANALYZE</span><span>RESPOND</span><i /><small>A SAFER DIGITAL WORLD<br />TOGETHER</small></div>
        <div className="hero-bottom-cards" aria-label="Platform highlights">
          {[['Threat Detection', 'AI-assisted review', ShieldAlert], ['Vulnerability Scanning', 'Code & web', ScanSearch], ['Guided Response', 'People stay in control', ShieldCheck], ['One Workspace', 'Projects, notes and reports', Workflow]].map(([title, caption, Icon]) => <div className="hero-mini-card" key={title}><span><Icon size={17} /></span><div><b>{title}</b><small>{caption}</small></div></div>)}
        </div>
        <a href="#features" className="scroll-cue" aria-label="Scroll to features"><ArrowDown size={15} /></a>
      </section>

      <section id="features" className="section features-section">
        <div className="features-orbit" aria-hidden="true" />
        <div className="section-heading"><span className="section-chip">POWERFUL FEATURES</span><h2>Everything You Need<br />for Modern Cybersecurity</h2><p>Cyber Shield AI brings security analysis and practical workflows together in one place.</p></div>
        <div className="feature-grid">{features.map(({ title, description, icon: Icon, tone }) => <article className="feature-card" key={title}><div className={'feature-icon ' + tone}><Icon size={23} /></div><h3>{title}</h3><p>{description}</p><a href="#workflow">Explore workflow <ArrowRight size={13} /></a></article>)}</div>
      </section>

      <section id="about" className="agent-section section">
        <div className="agent-visual"><div className="agent-rings" aria-hidden="true" /><img src="/assets/ai-assistant-avatar-high-resolution.png" alt="Illustration of the Cyber Shield AI assistant" loading="lazy" /><span className="agent-status"><i /> SECURITY COMPANION <b>DEMO</b></span></div>
        <div className="agent-copy"><span className="section-chip">MEET YOUR AI SECURITY PARTNER</span><h2>Security questions,<br /><span>made easier to work through.</span></h2><p>Cyber Shield AI is designed to help people make sense of security signals, code and investigation tasks. It keeps the context close, explains the next step and leaves important decisions with you.</p><ul><li><CheckCircle2 /> Understand security concepts and findings</li><li><CheckCircle2 /> Organize analysis, projects and reports</li><li><CheckCircle2 /> Keep people in control of response actions</li></ul><div className="agent-note"><Sparkles size={17} /><span>This landing page is a product preview. AI and scanning services are not connected in this demo.</span></div><button className="button button-outline" onClick={dashboard}>Explore Dashboard Demo <ArrowUpRight size={15} /></button></div>
      </section>

      <section id="workflow" className="section workflow-section">
        <div className="workflow-topline"><span className="section-chip">HOW IT WORKS</span><div className="workflow-meta"><span className="meta-line" /> A CLEARER PATH FROM QUESTION TO ACTION</div></div>
        <div className="workflow-intro"><h2>From Signal<br /><span>to Next Step.</span></h2><p>Bring a security question into focus, review what matters, then decide how to respond.</p></div>
        <div className="stage-grid">{stages.map(({ n, label, title, body, icon: Icon }, i) => <React.Fragment key={label}><article className="stage-card"><span className="stage-number">{n} <i /></span><div className="stage-icon"><Icon size={24} /></div><p className="stage-label">{label}</p><h3>{title}</h3><p>{body}</p></article>{i < stages.length - 1 && <div className="stage-connector" aria-hidden="true"><span /><ArrowRight size={17} /></div>}</React.Fragment>)}</div>
        <div className="workflow-foot"><span><Activity size={15} /> ANALYSIS STAYS EXPLAINABLE</span><span>Recommendations are illustrative until connected to an authorized service.</span></div>
      </section>

      <section id="use-cases" className="section use-cases-section"><div className="use-cases-heading"><div><span className="section-chip">USE CASES</span><h2>Built for Real-World<br /><span>Security Challenges</span></h2></div><p>Whether you are learning, building or protecting systems, Cyber Shield AI adapts to your work.</p></div><div className="audience-grid">{audiences.map(({ title, text, icon: Icon }, i) => <article className="audience-card" key={title}><span className={'audience-icon icon-' + i}><Icon size={24} /></span><h3>{title}</h3><p>{text}</p><button onClick={dashboard}>Open Dashboard <ArrowRight size={13} /></button></article>)}</div></section>

      <section id="pricing" className="section pricing-section"><div className="section-heading"><span className="section-chip">SIMPLE & FLEXIBLE</span><h2>Choose the Plan<br /><span>That Fits Your Needs</span></h2><p>Explore the shared dashboard demo. Billing and accounts are not connected in this preview.</p></div><div className="pricing-grid">{plans.map((plan) => <article className={'pricing-card ' + (plan.popular ? 'is-popular' : '')} key={plan.kind}>{plan.popular && <span className="popular-tag">MOST POPULAR</span>}<h3>{plan.name}</h3><p className="plan-audience">{plan.audience}</p><div className="plan-price"><strong>{plan.price}</strong>{plan.cadence && <small>{plan.cadence}</small>}</div><ul>{plan.items.map((item) => <li key={item}><CheckCircle2 size={14} />{item}</li>)}</ul><button className={'button ' + (plan.popular ? 'button-primary' : 'button-outline')} onClick={() => plan.kind === 'free' ? dashboard() : open(plan.kind)}>{plan.kind === 'free' ? 'Open Dashboard' : plan.action} {plan.kind === 'enterprise' ? <ArrowUpRight size={14} /> : <ArrowRight size={14} />}</button></article>)}</div></section>

      <section className="closing-cta"><img className="cta-globe" src="/assets/digital-globe-network-high-resolution.png" alt="" loading="lazy" /><div className="cta-content"><span className="section-chip">A SAFER DIGITAL WORLD, TOGETHER</span><h2>Build a more confident<br />security practice.</h2><p>Explore Cyber Shield AI and see how an organized security workflow can support your work.</p><button className="button button-primary" onClick={dashboard}>Open the Dashboard <ArrowRight size={16} /></button></div><div className="cta-circuit" aria-hidden="true"><span /><span /><span /></div></section>
    </main>

    <footer className="site-footer"><a href="#home" className="footer-brand"><img src="/assets/cyber-shield-ai-logo.png" alt="Cyber Shield AI" /><span>DETECT <i /> ANALYZE <i /> RESPOND</span></a><p>AI-assisted cybersecurity workflows, built to keep people in control.</p><nav aria-label="Footer navigation"><a href="#features">Features</a><a href="#workflow">How It Works</a><a href="#use-cases">Use Cases</a><a href="#pricing">Pricing</a><button onClick={() => open('enterprise')}>Contact</button><button onClick={dashboard}>Dashboard Demo</button></nav><div className="footer-bottom"><span>© {new Date().getFullYear()} Cyber Shield AI</span><span>Product preview · No live security services connected</span></div></footer>

    <dialog ref={dialogRef} className="landing-dialog" onClose={() => { setModal(''); setSent(false); }} onClick={(e) => { if (e.target === dialogRef.current) dialogRef.current.close(); }}>
      <button className="dialog-close" aria-label="Close dialog" onClick={close}><X size={18} /></button>
      {sent ? <div className="dialog-success"><div className="success-mark"><Check size={24} /></div><span className="section-chip">LOCAL PREVIEW</span><h2>{modal === 'enterprise' ? 'Contact flow complete.' : 'You’re ready to explore.'}</h2><p>{modal === 'enterprise' ? 'Your details were validated in this browser only. Nothing was sent to a sales team.' : 'No account was created and no payment or signup request was sent. You can open the local dashboard demo.'}</p><div className="dialog-buttons"><button className="button button-outline" onClick={close}>Close</button><button className="button button-primary" onClick={dashboard}>Open Dashboard Demo <ArrowRight size={15} /></button></div></div> : modal === 'demo' ? <div className="dialog-info"><span className="section-chip">PRODUCT PREVIEW</span><h2>See the workflow in action.</h2><p>The dashboard demo contains representative data and local interactions. It does not run scans or connect to an AI service.</p><div className="demo-preview-list"><span><ShieldAlert /> Threat review interface</span><span><FileSearch /> Scan request forms</span><span><Workflow /> Projects and task workflows</span></div><button className="button button-primary" onClick={dashboard}>Open Dashboard Demo <ArrowRight size={15} /></button></div> : <form onSubmit={submit} noValidate>
        <span className="section-chip">{modal === 'enterprise' ? 'CONTACT SALES · DEMO' : modal === 'pro' ? 'PRO PLAN · PREVIEW' : modal === 'signin' ? 'DEMO ACCESS' : 'START WITH CYBER SHIELD AI'}</span>
        <h2>{modal === 'enterprise' ? 'Talk through your team’s needs.' : modal === 'pro' ? 'Pro plan selection' : modal === 'signin' ? 'Sign in is not connected.' : 'Start with a guided demo.'}</h2>
        {modal === 'signin' ? <><p>Authentication is not configured in this project. Open the local dashboard demo to explore the current interface.</p><div className="dialog-buttons"><button type="button" className="button button-outline" onClick={close}>Cancel</button><button type="button" className="button button-primary" onClick={dashboard}>Open Dashboard Demo <ArrowRight size={15} /></button></div></> : <>
          <p>{modal === 'enterprise' ? 'Share a few details to preview the contact flow. This form stays in your browser and is not sent.' : modal === 'pro' ? 'The $9/month Pro plan is shown as in the concept reference. Checkout is not configured and no payment will be taken.' : 'Explore the platform with demonstration data. No account is created and no information is transmitted.'}</p>
          {modal === 'enterprise' && <label>Your name<input ref={firstField} value={form.name} onChange={update('name')} placeholder="Name" required /></label>}
          <label>Email address<input ref={firstField} type="email" value={form.email} onChange={update('email')} placeholder="you@example.com" required autoComplete="email" /></label>
          {modal === 'enterprise' && <><label>Organization<input value={form.organization} onChange={update('organization')} placeholder="Organization name" /></label><label>How can we help?<textarea value={form.message} onChange={update('message')} placeholder="Tell us about your security workflow" rows="3" required /></label></>}
          {error && <p className="dialog-error" role="alert">{error}</p>}
          <div className="dialog-buttons"><button type="button" className="button button-outline" onClick={close}>Cancel</button><button type="submit" className="button button-primary">{modal === 'enterprise' ? 'Review Contact Request' : modal === 'pro' ? 'Review Pro Plan' : 'Continue to Demo'} <ArrowRight size={15} /></button></div>
        </>}
      </form>}
    </dialog>
  </div>;
}

export default LandingPage;
