import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Award, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, CircleHelp, Clock3, FileText, Flame, History, Lightbulb, ListChecks, LogOut, Menu, Mic, MoreHorizontal, RotateCcw, Search, Settings, Sparkles, TrendingUp, UserRound, X } from 'lucide-react';
import { api } from './api';
import { getCurrentAccount, getStoredProfile, signInWithGoogle, signOut, updateProfile } from './auth';
import type { ConfigStatus, DailyEssence, Entry, Integrations, Proposal, Recap, WeeklyReview } from './types';
import './dev-sw-cleanup';
import './styles.css';

const date = (value?: string | null) => value
  ? new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
  : 'No time set';

const relative = (value: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value));
const metaText = (entry: Entry, key: string) => typeof entry.metadata?.[key] === 'string' ? String(entry.metadata[key]) : '';
const metaList = (entry: Entry, key: string) => Array.isArray(entry.metadata?.[key]) ? (entry.metadata[key] as unknown[]).filter(Boolean).map(String) : [];

function Layout({ children }: { children: React.ReactNode }) {
  const [menu, setMenu] = useState(false);
  const [more, setMore] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(() => localStorage.getItem('pinapeg.onboardingComplete') === 'yes');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [installDismissed, setInstallDismissed] = useState(false);
  const location = useLocation();
  const nav = useNavigate();
  const welcomePaths = new Set(['/', '/welcome', '/signin', '/signup']);
  const isOnboarding = welcomePaths.has(location.pathname);
  const appChromeVisible = !isOnboarding && onboardingDone;
  const logoTarget = appChromeVisible ? '/capture' : '/welcome';
  const primaryItems = [
    ['/capture', 'Capture', Mic],
    ['/schedule', 'Schedule', CalendarDays],
    ['/history', 'History', History],
  ] as const;
  const moreItems = [
    ['/thoughts', 'Thoughts', Lightbulb],
    ['/habits', 'Habits', Flame],
    ['/papers', 'Papers', FileText],
    ['/projects', 'Scholarships', CircleHelp],
    ['/cv-timeline', 'CV', Award],
    ['/weekly-review', 'Review', Sparkles],
  ] as const;
  const moreActive = moreItems.some(([to]) => location.pathname === to || location.pathname.startsWith(`${to}/`));
  const accountActive = location.pathname === '/account' || location.pathname === '/settings';

  const handleSignOut = async () => {
    await signOut();
    setOnboardingDone(false);
    setMenu(false);
    setMore(false);
    nav('/welcome', { replace: true });
  };

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice?.outcome === 'accepted') setInstallPrompt(null);
  };

  useEffect(() => {
    const splash = document.getElementById('splash-screen');
    if (splash) {
      setTimeout(() => {
        splash.style.opacity = '0';
        splash.style.visibility = 'hidden';
        setTimeout(() => splash.remove(), 500);
      }, 400);
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      const isSignedOut = localStorage.getItem('pinapeg.signedOut') === 'yes';
      if (!isSignedOut) {
        try {
          const auth = await import('@neondatabase/auth');
          const client = auth.createAuthClient(import.meta.env.VITE_NEON_AUTH_URL);
          const session = await client.getSession();
          const data = (session as any)?.data ?? session;
          if (data?.user) {
            localStorage.setItem('pinapeg.onboardingComplete', 'yes');
            setOnboardingDone(true);
          }
        } catch (e) {
          // Not configured or not logged in.
        }
      }
      
      const done = !isSignedOut && localStorage.getItem('pinapeg.onboardingComplete') === 'yes';
      setOnboardingDone(done);
      setMenu(false);
      setMore(false);
      
      if (!isOnboarding && !done) {
        nav('/welcome', { replace: true });
      } else if (isOnboarding && done) {
        nav('/capture', { replace: true });
      }
      setCheckingAuth(false);
    };
    checkAuth();
  }, [isOnboarding, location.pathname, nav]);

  if (checkingAuth) {
    return (
      <div className="app-shell">
        <header>
          <div className="wordmark">pinapeg<span>.</span></div>
        </header>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header>
        <Link to={logoTarget} className="wordmark" onClick={() => { setMenu(false); setMore(false); }}>pinapeg<span>.</span></Link>
        {appChromeVisible && <button className={`icon-button mobile-menu ${menu ? 'open' : ''}`} onClick={() => setMenu(!menu)} aria-label="Menu" aria-expanded={menu}><Menu /></button>}
        {appChromeVisible && (
          <nav className={`top-nav ${menu ? 'open' : ''}`} aria-label="Main navigation">
            <div className="nav-primary">
              {primaryItems.map(([to, label, Icon]) => (
                <NavLink key={to} to={to} end onClick={() => setMenu(false)}>
                  <Icon size={17} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
            <div className="nav-secondary">
              <div className="more-wrap">
                <button className={`nav-button ${moreActive ? 'active' : more ? 'open' : ''}`} type="button" onClick={() => setMore(!more)} aria-expanded={more} aria-controls="desktop-more-menu">
                  <MoreHorizontal size={17} />
                  <span>More</span>
                </button>
                <div id="desktop-more-menu" className={`more-menu ${more ? 'open' : ''}`}>
                  {moreItems.map(([to, label, Icon]) => (
                    <NavLink key={to} to={to} onClick={() => { setMenu(false); setMore(false); }}>
                      <Icon size={17} />
                      <span>{label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
              <NavLink
                to="/account"
                onClick={() => setMenu(false)}
                className={({ isActive }) => `account-link ${isActive || accountActive ? 'active' : ''}`}
              >
                <UserRound size={17} />
                <span>Account</span>
              </NavLink>
              <button className="mobile-signout" type="button" onClick={() => void handleSignOut()}>
                <LogOut size={17} />
                <span>Sign out</span>
              </button>
            </div>
          </nav>
        )}
        {appChromeVisible && <div className="date-stamp">{new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</div>}
      </header>
      <main key={location.pathname}>
        {installPrompt && !installDismissed && (
          <div className="pwa-install-banner">
            <div className="pwa-install-info">
              <Sparkles size={20} className="pwa-icon" />
              <div>
                <strong>Install Pinapeg Companion App</strong>
                <p>Fast voice capture & instant offline access from your home screen.</p>
              </div>
            </div>
            <div className="pwa-install-actions">
              <button type="button" className="cta-animated" onClick={handleInstallClick}>Install App</button>
              <button type="button" className="text-link" onClick={() => setInstallDismissed(true)}>Dismiss</button>
            </div>
          </div>
        )}
        {children}
      </main>
      {appChromeVisible && <MobileNav onNavigate={() => { setMenu(false); setMore(false); }} />}
      {appChromeVisible && <DailyEssencePopup pathname={location.pathname} />}
    </div>
  );
}

function DailyEssencePopup({ pathname }: { pathname: string }) {
  const nav = useNavigate();
  const [essence, setEssence] = useState<DailyEssence | null>(null);
  const [visible, setVisible] = useState(false);
  const quietPaths = new Set(['/', '/welcome', '/signin', '/signup']);

  useEffect(() => {
    if (quietPaths.has(pathname)) {
      setVisible(false);
      return;
    }

    let cancelled = false;
    api.dailyEssence().then(result => {
      const storageKey = `pinapeg.dailyEssence.${result.date}`;
      if (!cancelled && localStorage.getItem(storageKey) !== 'dismissed') {
        setEssence(result);
        setVisible(true);
      }
    }).catch(() => undefined);

    return () => { cancelled = true; };
  }, [pathname]);

  if (!visible || !essence) return null;

  const close = () => {
    localStorage.setItem(`pinapeg.dailyEssence.${essence.date}`, 'dismissed');
    setVisible(false);
  };
  const openFocus = () => {
    close();
    nav(essence.route || '/capture');
  };
  const counts = Object.entries(essence.module_counts).filter(([, count]) => count > 0);

  return (
    <div className="essence-dock" role="presentation">
      <section className="daily-essence" role="dialog" aria-modal="false" aria-label="Daily essence">
        <button className="essence-close icon-button" onClick={close} aria-label="Close daily essence"><X /></button>
        <p className="eyebrow">Daily essence</p>
        <h2>{essence.title}</h2>
        <p>{essence.message}</p>
        {essence.related_entry && (
          <div className="essence-related">
            <span>{essence.focus_type}</span>
            <strong>{essence.related_entry.title}</strong>
          </div>
        )}
        {counts.length > 0 && (
          <div className="essence-counts" aria-label="Open module counts">
            {counts.map(([label, count]) => <span key={label}>{count} {label}</span>)}
          </div>
        )}
        <div className="essence-actions">
          <button className="secondary" onClick={close}>Not now</button>
          <button className="primary" onClick={openFocus}>{essence.suggested_action} <ChevronRight size={16} /></button>
        </div>
      </section>
    </div>
  );
}

function Welcome() {
  const nav = useNavigate();
  const [revealStep, setRevealStep] = useState(0);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState('');
  const storedProfile = getStoredProfile();
  const [selectedFocus, setSelectedFocus] = useState(storedProfile.focus);
  const [selectedMode, setSelectedMode] = useState(storedProfile.workMode);
  const revealItems = [
    {
      id: 'blank-page',
      kicker: '01 / Begin',
      title: 'Start with the loose thought.',
      copy: 'A thought, deadline, paper, habit, or scholarship can begin as one plain sentence — before it needs a category.',
      note: 'Pinapeg keeps the first moment light.',
    },
    {
      id: 'signal',
      kicker: '02 / Keep the signal',
      title: 'The important parts find their way back.',
      copy: 'Daily Essence, timely nudges, and a weekly review keep your signal visible without filling every corner of your day.',
      note: 'A calm system, not another noisy dashboard.',
    },
    {
      id: 'google',
      kicker: '03 / Your page is ready',
      title: 'Bring your life into one quiet place.',
      copy: 'Continue with Google to create your private Pinapeg space. You can edit your profile and connections whenever you want.',
      note: 'Google gives you a secure, familiar way in.',
    },
  ] as const;
  const focusOptions = ['Open capture', 'Scholarships', 'Research', 'Schedule'] as const;
  const modeOptions = ['Fast capture', 'Deep work', 'Weekly review'] as const;
  const activeReveal = revealItems[revealStep];
  const revealReady = revealStep === revealItems.length - 1;
  const routeForFocus = (focus: string) => focus === 'Scholarships' ? '/projects' : focus === 'Research' ? '/papers' : focus === 'Schedule' ? '/schedule' : '/capture';

  const continueWithGoogle = async () => {
    const nextRoute = routeForFocus(selectedFocus);
    setAuthError('');
    setSigningIn(true);
    try {
      await updateProfile({ focus: selectedFocus, workMode: selectedMode });
      localStorage.setItem('pinapeg.onboardingComplete', 'yes');
      const started = await signInWithGoogle(nextRoute);
      if (!started) throw new Error('Google sign-in is not configured yet. Add VITE_NEON_AUTH_URL and enable Google in Neon Auth.');
      nav(nextRoute);
    } catch (error) {
      localStorage.removeItem('pinapeg.onboardingComplete');
      setAuthError(error instanceof Error ? error.message : 'Google sign-in could not start. Please try again.');
    } finally {
      setSigningIn(false);
    }
  };
  const revealNext = () => {
    setAuthError('');
    setRevealStep(step => Math.min(step + 1, revealItems.length - 1));
  };
  const revealPrevious = () => {
    setAuthError('');
    setRevealStep(step => Math.max(step - 1, 0));
  };

  return (
    <section className="page auth-page welcome-page">
      <div className="paper-scene">
        <div className="paper-deck" aria-hidden="true">
          <span className="paper-underlay paper-underlay-one" />
          <span className="paper-underlay paper-underlay-two" />
        </div>
        <article className={`onboarding-sheet sheet-${activeReveal.id}`} key={activeReveal.id}>
          <div className="sheet-fold" aria-hidden="true" />
          <div className="sheet-topline">
            <span>pinapeg / your personal companion</span>
            <span>{String(revealStep + 1).padStart(2, '0')} ? {String(revealItems.length).padStart(2, '0')}</span>
          </div>
          <div className="sheet-body">
            <div className="sheet-copy">
              <span className="entry-kicker">{activeReveal.kicker}</span>
              <h1>{activeReveal.title}</h1>
              <p>{activeReveal.copy}</p>
              <small className="sheet-note">{activeReveal.note}</small>
            </div>


            {activeReveal.id === 'signal' && (
              <aside className="sheet-margin-note">
                <Sparkles size={18} />
                <span>Daily Essence appears as a small, dismissible note ? only when it has something useful to say.</span>
              </aside>
            )}
          </div>

          <footer className="sheet-footer">
            <button className="sheet-back" type="button" onClick={revealPrevious} disabled={revealStep === 0}>Back</button>
            <div className="sheet-progress" aria-label={`Step ${revealStep + 1} of ${revealItems.length}`}>
              {revealItems.map((item, index) => <span key={item.id} className={index <= revealStep ? 'active' : ''} />)}
            </div>
            {revealReady ? (
              <div className="google-action">
                <button className="google-entry" type="button" onClick={() => void continueWithGoogle()} disabled={signingIn}>
                  <span className="google-mark" aria-hidden="true">G</span>
                  <strong>{signingIn ? 'Opening Google?' : 'Continue with Google'}</strong>
                </button>
                {authError && <p className="auth-error" role="alert">{authError}</p>}
              </div>
            ) : (
              <button className="primary sheet-next cta-animated" type="button" onClick={revealNext}>Turn the page <ChevronRight size={17} /></button>
            )}
          </footer>
        </article>
      </div>
    </section>
  );
}

function CaptureGuides() {
  const guides = [
    ['Open thought', 'Drop the loose thing here. If it is not actionable yet, it remains a thought instead of becoming noise.'],
    ['Research paper', 'Paste a DOI, arXiv link, or title. Pinapeg can keep authors, abstract, source, and reading status.'],
    ['Scholarship', 'Name the opportunity and deadline. Pinapeg can turn it into a plan with smaller steps.'],
  ] as const;

  return (
    <div className="capture-guides">
      {guides.map(([title, copy]) => (
        <article key={title}>
          <span className="entry-kicker">{title}</span>
          <p>{copy}</p>
        </article>
      ))}
    </div>
  );
}

function GuidedCapturePanel({
  icon,
  kicker,
  title,
  copy,
  placeholder,
  buttonLabel,
  buildText,
  onSaved,
}: {
  icon: React.ReactNode;
  kicker: string;
  title: string;
  copy: string;
  placeholder: string;
  buttonLabel: string;
  buildText: (value: string) => string;
  onSaved: () => Promise<void> | void;
}) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const clean = value.trim();
    if (!clean || saving) return;
    setSaving(true);
    setMessage('');
    try {
      const proposal = await api.capture(buildText(clean));
      const entry = await api.confirm(proposal.id);
      setValue('');
      setMessage(`Saved: ${entry.title}`);
      await onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save this entry yet.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="guided-capture" onSubmit={submit}>
      <div className="guided-copy">
        <span className="wrap-icon">{icon}</span>
        <div>
          <span className="entry-kicker">{kicker}</span>
          <h2>{title}</h2>
          <p>{copy}</p>
        </div>
      </div>
      <div className="guided-input-row">
        <input value={value} onChange={event => setValue(event.target.value)} placeholder={placeholder} />
        <button className="cta-animated" type="submit" disabled={saving || !value.trim()}>{saving ? 'Saving...' : buttonLabel}</button>
      </div>
      {message && <p className="guided-message">{message}</p>}
    </form>
  );
}

function Capture() {
  const [input, setInput] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const presets = [
    { label: 'Thought', icon: Lightbulb, text: 'I keep thinking about how to make my demo feel calmer and more complete' },
    { label: 'Paper', icon: FileText, text: 'Track this research paper: https://arxiv.org/abs/1706.03762' },
    { label: 'Scholarship', icon: CircleHelp, text: 'I want to apply for the Google scholarship before October 30' },
    { label: 'Habit', icon: Flame, text: 'I want to read research papers every day' },
  ] as const;

  const submit = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError('');
    try {
      setProposal(await api.capture(input));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to understand that.');
    } finally {
      setLoading(false);
    }
  };

  const toggleRecord = async () => {
    if (recording) {
      recorder.current?.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const instance = new MediaRecorder(stream);
      recorder.current = instance;
      instance.ondataavailable = e => chunks.push(e.data);
      instance.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setRecording(false);
        const blob = new Blob(chunks, { type: instance.mimeType || 'audio/webm' });
        setLoading(true);
        setVoiceStatus('Preparing voice note...');
        try {
          setVoiceStatus('Preparing transcript...');
          setProposal(await api.captureAudio(blob));
          setInput('');
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Unable to process this recording.');
        } finally {
          setVoiceStatus('');
          setLoading(false);
        }
      };
      instance.start();
      setRecording(true);
      setVoiceStatus('');
    } catch {
      setError('Microphone permission was not granted. You can still type your thought below.');
    }
  };

  return (
    <>
      <section className="capture">
        <p className="eyebrow">A place to put the things you want to keep</p>
        <h1>What's on your mind?</h1>
        <p className="lede">Say it plainly. We'll hold onto the details and bring them back when they matter.</p>
        <div className={`orb ${recording ? 'recording' : ''}`}>
          <button className="mic-button" onClick={toggleRecord} aria-label={recording ? 'Stop recording' : 'Start voice capture'}><Mic size={42} /></button>
          {!recording && <span className="mic-prompt">Tap to speak</span>}
          {recording && <span className="recording-label">Listening <i /><i /><i /></span>}
        </div>
        <div className="capture-rule"><span>or write it down</span></div>
        <div className="quick-capture">
          {presets.map(({ label, icon: Icon, text }) => (
            <button key={label} type="button" onClick={() => setInput(text)}>
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
        <div className="composer">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void submit(); }}
            placeholder="e.g. Book design sync Friday at 10, paste a paper link, or start a scholarship plan..."
            rows={3}
          />
          <button className="send cta-animated" disabled={loading || !input.trim()} onClick={() => void submit()}>
            {loading ? 'Thinking...' : <>Continue <ChevronRight size={17} /></>}
          </button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {voiceStatus && <p className="hint">{voiceStatus}</p>}
        <p className="hint">Your capture is private. Nothing is scheduled or changed until you confirm.</p>
        <CaptureGuides />
      </section>
      {proposal && <ProposalSheet proposal={proposal} close={() => setProposal(null)} reset={() => setInput('')} />}
    </>
  );
}

function ProposalSheet({ proposal, close, reset }: { proposal: Proposal; close: () => void; reset: () => void }) {
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const nav = useNavigate();
  const isQuery = proposal.intent === 'QUERY';
  const labels: Record<Proposal['intent'], string> = {
    CREATE: 'A calendar moment',
    REMINDER_ONLY: 'A reminder to keep',
    OPEN_THOUGHT: 'An open thought',
    QUERY: 'From your memory',
    TRACK_PAPER: 'A paper to keep close',
    TRACK_SCHOLARSHIP: 'A scholarship to pursue',
    LOG_HABIT: 'A habit to build',
  };
  const destination = proposal.resolves_entry_id
    ? { to: '/thoughts', label: 'Open thoughts' }
    : proposal.intent === 'TRACK_PAPER'
      ? { to: '/papers', label: 'Open papers' }
      : proposal.intent === 'TRACK_SCHOLARSHIP'
        ? { to: '/projects', label: 'Open scholarships' }
        : proposal.intent === 'LOG_HABIT'
          ? { to: '/habits', label: 'Open habits' }
          : proposal.intent === 'CREATE' || proposal.intent === 'REMINDER_ONLY'
            ? { to: '/schedule', label: 'Open schedule' }
            : { to: '/thoughts', label: 'Open thoughts' };

  const confirm = async () => {
    setSaving(true);
    try {
      await api.confirm(proposal.id);
      setDone(true);
      reset();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sheet-backdrop" role="presentation">
      <section className="proposal-sheet" role="dialog" aria-modal="true">
        <button className="sheet-close icon-button" onClick={close} aria-label="Close"><X /></button>
        {done ? (
          <div className="saved">
            <div className="saved-mark"><Check /></div>
            <p className="eyebrow">Saved gently</p>
            <h2>It's with you now.</h2>
            <div className="saved-actions">
              <button className="primary" onClick={() => { close(); nav(destination.to); }}>{destination.label}</button>
              <button className="secondary" onClick={close}>Capture another</button>
            </div>
          </div>
        ) : (
          <>
            <p className="eyebrow">{labels[proposal.intent]}</p>
            <h2>{proposal.title}</h2>
            {proposal.datetime && <p className="proposal-time"><Clock3 size={17} />{date(proposal.datetime)}</p>}
            {proposal.notes && <p className="proposal-notes">{proposal.notes}</p>}
            {proposal.memory_note && <div className="memory-note"><Sparkles size={16} /><span>{proposal.memory_note}</span></div>}
            {proposal.related_entries.length > 0 && (
              <div className="related">
                <span>Connected to</span>
                {proposal.related_entries.map(e => <Link key={e.id} to="/thoughts" onClick={close}>{e.title} <ChevronRight size={14} /></Link>)}
              </div>
            )}
            {isQuery ? (
              <>
                <p className="answer">{proposal.answer}</p>
                <button className="primary" onClick={close}>Done</button>
              </>
            ) : (
              <div className="sheet-actions">
                <button className="secondary" onClick={close}>Keep editing</button>
                <button className="primary" onClick={() => void confirm()} disabled={saving}>
                  {saving ? 'Saving...' : proposal.resolves_entry_id ? 'Confirm update' : 'Confirm'}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Schedule() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [view, setView] = useState<'week' | 'month'>('month');
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });

  useEffect(() => { api.schedule().then(setEntries).catch(() => setEntries([])); }, []);

  const keyForDate = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  const entryDateKey = (entry: Entry) => entry.scheduled_at ? keyForDate(new Date(entry.scheduled_at)) : '';
  const entriesForDay = (day: Date) => entries.filter(entry => entryDateKey(entry) === keyForDate(day));

  const today = new Date();
  const selDateObj = new Date(selectedDate);
  const currentYear = selDateObj.getFullYear();
  const currentMonth = selDateObj.getMonth();

  const firstDay = new Date(currentYear, currentMonth, 1);
  const startDayOfWeek = firstDay.getDay();
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - startDayOfWeek);

  const lastDay = new Date(currentYear, currentMonth + 1, 0);
  const totalDays = (startDayOfWeek + lastDay.getDate()) > 35 ? 42 : 35;
  const monthGridDays = Array.from({ length: totalDays }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });

  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(startOfWeek);
    day.setDate(startOfWeek.getDate() + index);
    return day;
  });

  const changeMonth = (delta: number) => {
    const d = new Date(currentYear, currentMonth + delta, 1);
    setSelectedDate(keyForDate(d));
  };

  const visibleEntries = entries.filter(entry => entryDateKey(entry) === selectedDate);

  return (
    <section className="page">
      <div className="page-heading">
        <div><p className="eyebrow">Your time, held clearly</p><h1>Schedule</h1></div>
        <div className="view-switch">
          {(['week', 'month'] as const).map(option => (
            <button key={option} className={view === option ? 'active' : ''} onClick={() => setView(option)}>{option}</button>
          ))}
        </div>
      </div>

      {view === 'month' ? (
        <div className="month-calendar-wrap">
          <div className="month-nav">
            <button type="button" onClick={() => changeMonth(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button>
            <h2>{new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(currentYear, currentMonth, 1))}</h2>
            <button type="button" onClick={() => changeMonth(1)} aria-label="Next month"><ChevronRight size={18} /></button>
          </div>
          <div className="month-grid-header">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <span key={d}>{d}</span>)}
          </div>
          <div className="month-grid">
            {monthGridDays.map(day => {
              const key = keyForDate(day);
              const dayEntries = entriesForDay(day);
              const isCurrentMonth = day.getMonth() === currentMonth;
              const isSelected = selectedDate === key;
              const isToday = keyForDate(today) === key;
              return (
                <button
                  key={key}
                  type="button"
                  className={`month-cell ${!isCurrentMonth ? 'outside' : ''} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                  onClick={() => setSelectedDate(key)}
                >
                  <span className="month-date-num">{day.getDate()}</span>
                  {dayEntries.length > 0 && (
                    <div className="month-cell-dots">
                      {dayEntries.slice(0, 3).map((_, idx) => (
                        <span key={idx} className="dot" />
                      ))}
                      {dayEntries.length > 3 && <span className="more-count">+{dayEntries.length - 3}</span>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="calendar-strip" aria-label="Schedule calendar">
          {weekDays.map(day => {
            const key = keyForDate(day);
            const dayEntries = entriesForDay(day);
            return (
              <button key={key} className={selectedDate === key ? 'active' : ''} onClick={() => setSelectedDate(key)}>
                <span>{new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(day)}</span>
                <b>{day.getDate()}</b>
                <i>{dayEntries.length ? `${dayEntries.length} item${dayEntries.length > 1 ? 's' : ''}` : 'clear'}</i>
              </button>
            );
          })}
        </div>
      )}

      <div className="schedule-selected-header">
        <h2>{selectedDate === keyForDate(today) ? 'Today' : new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(selectedDate))}</h2>
        <span>{visibleEntries.length} item{visibleEntries.length !== 1 ? 's' : ''}</span>
      </div>

      {visibleEntries.length ? (
        <div className="timeline">
          {visibleEntries.map(e => (
            <article className="timeline-entry" key={e.id}>
              <time>{e.scheduled_at ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(e.scheduled_at)) : 'Anytime'}</time>
              <div>
                <span className="entry-kicker">{e.type === 'event' ? 'Calendar' : 'Reminder'}</span>
                <h3>{e.title}</h3>
                {e.notes && <p>{e.notes}</p>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="schedule-empty-flushed">
          <Empty icon={<CalendarDays />} title="Nothing scheduled for this day." copy="Select another date or capture a new deadline or event." action="Capture item" to="/capture" />
        </div>
      )}
    </section>
  );
}

function Thoughts() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [filter, setFilter] = useState<'open' | 'resolved'>('open');
  const load = () => api.entries(`?type=thought&status=${filter}`).then(setEntries).catch(() => setEntries([]));
  useEffect(() => { void load(); }, [filter]);
  const resolve = async (entry: Entry) => {
    await api.updateStatus(entry.id, entry.status === 'open' ? 'resolve' : 'reopen');
    void load();
  };

  return (
    <section className="page">
      <div className="page-heading">
        <div><p className="eyebrow">The things still taking shape</p><h1>Open thoughts</h1></div>
        <button className="icon-button search-inline" aria-label="Search"><Search /></button>
      </div>
      <div className="segmented">
        <button className={filter === 'open' ? 'active' : ''} onClick={() => setFilter('open')}>Open</button>
        <button className={filter === 'resolved' ? 'active' : ''} onClick={() => setFilter('resolved')}>Resolved</button>
      </div>
      {entries.length ? (
        <div className="thought-list">
          {entries.map(e => (
            <article className="thought" key={e.id}>
              <div>
                <span className="entry-kicker">Captured {relative(e.created_at)}</span>
                <h3>{e.title}</h3>
                <p>{e.notes}</p>
              </div>
              <button className="status-button" onClick={() => void resolve(e)}>
                {e.status === 'open' ? <><Check size={15} /> Resolve</> : <><RotateCcw size={15} /> Reopen</>}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <Empty icon={<Lightbulb />} title={filter === 'open' ? 'No open thoughts.' : 'No resolved thoughts.'} copy="Unscheduled thoughts will appear here." action="Capture thought" to="/capture" />
      )}
    </section>
  );
}

function Habits() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [logged, setLogged] = useState<Set<string>>(new Set());
  const [metrics, setMetrics] = useState<Record<string, { logged_days: number; completion_rate: number; current_streak: number }>>({});
  const refreshMetrics = () => api.habitAnalytics().then(result => {
    setMetrics(Object.fromEntries(result.habits.map(metric => [metric.habit_entry_id, metric])));
  }).catch(() => setMetrics({}));
  const load = async () => {
    const items = await api.entries('?type=habit&status=open').catch(() => []);
    setEntries(items);
    void refreshMetrics();
  };
  useEffect(() => {
    void load();
  }, []);
  const log = async (id: string) => {
    await api.logHabit(id);
    setLogged(current => new Set(current).add(id));
    void refreshMetrics();
  };

  return (
    <section className="page">
      <div className="page-heading"><div><p className="eyebrow">Small actions, kept in view</p><h1>Today's habits</h1></div></div>
      <GuidedCapturePanel
        icon={<Flame size={18} />}
        kicker="Shelf shortcut"
        title="Save a habit quickly."
        copy="Add daily habits to your shelf."
        placeholder='e.g. Read one research page every evening'
        buttonLabel="Save to habits"
        buildText={value => `daily habit: ${value}`}
        onSaved={load}
      />
      {entries.length ? (
        <div className="thought-list">
          {entries.map(entry => (
            <article className="thought" key={entry.id}>
              <div>
                <span className="entry-kicker">Daily practice</span>
                <h3>{entry.title}</h3>
                <p>{logged.has(entry.id) ? 'Logged for today.' : 'One honest check-in is enough.'}</p>
                {metrics[entry.id] && (
                  <div className="metric-row">
                    <span>{metrics[entry.id].current_streak} day streak</span>
                    <span>{metrics[entry.id].logged_days}/30 logged</span>
                    <span>{Math.round(metrics[entry.id].completion_rate * 100)}%</span>
                  </div>
                )}
              </div>
              <button className="status-button" disabled={logged.has(entry.id)} onClick={() => void log(entry.id)}>
                {logged.has(entry.id) ? <><Check size={15} /> Logged</> : <><Flame size={15} /> Log today</>}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <Empty icon={<Flame />} title="No habits." copy='Add a daily practice to start tracking.' action="Add habit" to="/capture" />
      )}
    </section>
  );
}

function HistoryPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => { api.entries(q ? `?q=${encodeURIComponent(q)}` : '').then(setEntries).catch(() => setEntries([])); }, [q]);

  return (
    <section className="page">
      <div className="page-heading"><div><p className="eyebrow">Everything you've left yourself</p><h1>History</h1></div></div>
      <label className="search"><Search size={18} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search captures" /></label>
      <div className="history-list">
        {entries.map(e => (
          <article key={e.id}>
            <span>{relative(e.created_at)}</span>
            <div><h3>{e.title}</h3><p>{e.notes || (e.scheduled_at && date(e.scheduled_at))}</p></div>
            <MoreHorizontal size={19} />
          </article>
        ))}
      </div>
    </section>
  );
}

function RecapPage() {
  const [timeframe, setTimeframe] = useState('week');
  const [recap, setRecap] = useState<Recap | null>(null);
  useEffect(() => {
    api.recap(timeframe).then(setRecap).catch(() => setRecap({ timeframe, completed: [], still_open: [], worth_revisiting: [], narration: "Your recap will appear once you've saved a few moments." }));
  }, [timeframe]);

  return (
    <section className="page recap">
      <div className="page-heading"><div><p className="eyebrow">A moment to look back</p><h1>Your recap</h1></div></div>
      <div className="segmented">
        {['week', 'month', 'all'].map(t => <button key={t} className={timeframe === t ? 'active' : ''} onClick={() => setTimeframe(t)}>Past {t === 'all' ? 'all time' : t}</button>)}
      </div>
      <p className="recap-narration">{recap?.narration}</p>
      {recap?.worth_revisiting.length ? (
        <section className="revisit">
          <div><p className="eyebrow">Worth revisiting</p><h2>You mentioned these and haven't returned to them.</h2></div>
          {recap.worth_revisiting.map(e => <Link to="/thoughts" key={e.id}><span>{relative(e.created_at)}</span><strong>{e.title}</strong><ChevronRight /></Link>)}
        </section>
      ) : (
        <Empty icon={<Sparkles />} title="No threads to revisit." copy="Forgotten thoughts will surface here automatically." />
      )}
    </section>
  );
}

function AccountPage() {
  const [me, setMe] = useState<{ display_name: string; timezone: string; calendar_connected: boolean } | null>(null);
  const [account, setAccount] = useState<{ name?: string; email?: string } | null>(null);
  const [profile, setProfile] = useState(() => getStoredProfile());
  const [integrations, setIntegrations] = useState<Integrations | null>(null);
  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null);
  const [message, setMessage] = useState('');
  const [syncing, setSyncing] = useState<'calendar' | 'gmail' | ''>('');
  const [profileName, setProfileName] = useState('');
  const [profileRole, setProfileRole] = useState('');
  const [profileFocus, setProfileFocus] = useState('');
  const [profileMode, setProfileMode] = useState('');
  const [profileTimezone, setProfileTimezone] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [pushGranted, setPushGranted] = useState(() => typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted');
  const [profileEditing, setProfileEditing] = useState(false);
  const focusChoices = ['Open capture', 'Scholarships', 'Research', 'Schedule'] as const;
  const modeChoices = ['Fast capture', 'Deep work', 'Weekly review'] as const;
  const location = useLocation();
  useEffect(() => {
    api.me().then(setMe).catch(() => setMe({ display_name: 'You', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, calendar_connected: false }));
    api.integrations().then(setIntegrations).catch(() => setIntegrations(null));
    api.configStatus().then(setConfigStatus).catch(() => setConfigStatus(null));
    void getCurrentAccount().then(user => {
      const stored = getStoredProfile();
      const mergedProfile = {
        ...stored,
        name: user?.name || stored.name,
        email: user?.email || stored.email,
        timezone: stored.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      setAccount(user);
      setProfile(mergedProfile);
      setProfileName(mergedProfile.name || '');
      setProfileRole(mergedProfile.role || '');
      setProfileFocus(mergedProfile.focus || 'Open capture');
      setProfileMode(mergedProfile.workMode || 'Fast capture');
      setProfileTimezone(mergedProfile.timezone || '');
      void updateProfile(mergedProfile);
    });
    const params = new URLSearchParams(location.search);
    if (params.get('google') === 'connected') setMessage(`${params.get('provider') || 'Google'} connected.`);
    if (params.get('google') === 'error') setMessage(params.get('message') || 'Google connection failed.');
  }, [location.search]);
  const connectGoogle = async (provider: 'calendar' | 'gmail') => {
    try {
      const result = await api.googleConnect(provider);
      window.location.href = result.authorization_url;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to start Google connection.');
    }
  };
  const syncGoogle = async (provider: 'calendar' | 'gmail') => {
    setSyncing(provider);
    setMessage('');
    try {
      const result = await api.googleSync(provider);
      setMessage(result.message);
      setIntegrations(await api.integrations());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to run sync check.');
    } finally {
      setSyncing('');
    }
  };
  const statusLine = (connected?: boolean, email?: string | null) => connected ? `Connected${email ? ` as ${email}` : ''}` : 'Not connected';
  const saveProfile = async () => {
    if (!profileName.trim()) return;
    setProfileSaving(true);
    setMessage('');
    try {
      const updated = await updateProfile({
        name: profileName.trim(),
        role: profileRole.trim() || 'Student / Builder',
        focus: profileFocus || 'Open capture',
        workMode: profileMode || 'Fast capture',
        timezone: profileTimezone.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setProfile(updated);
      setAccount(current => ({ name: updated.name, email: updated.email || current?.email }));
      setMessage('Profile updated.');
      setProfileEditing(false);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to update profile.');
    } finally {
      setProfileSaving(false);
    }
  };
  const syncMeta = (connection?: Integrations['google_calendar']) => (
    <>
      {connection?.last_synced_at && <small className="integration-meta">Last checked {date(connection.last_synced_at)}</small>}
      {connection?.last_error && <small className="integration-meta error">Last error: {connection.last_error}</small>}
    </>
  );

  const profileNameValue = profile.name || account?.name || me?.display_name || 'You';
  const profileEmailValue = profile.email || account?.email;
  const profileTimezoneValue = profile.timezone || me?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <section className="page account-page settings">
      <div className="page-heading account-heading">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Profile & settings</h1>
        </div>
      </div>
      {message && <p className="integration-message">{message}</p>}

      <div className="account-layout">
        <aside className="account-profile-card">
          <div className="profile-avatar"><UserRound size={31} /></div>
          <span className="entry-kicker">Profile</span>
          <h2>{profileNameValue}</h2>
          <p>{profileEmailValue || 'Google account email will appear here after sign-in is connected.'}</p>
          <div className="profile-facts">
            <span><b>Timezone</b>{profileTimezoneValue}</span>
            <span><b>Focus</b>{profile.focus || 'Open capture'}</span>
            <span><b>Work mode</b>{profile.workMode || 'Fast capture'}</span>
            <span><b>Role</b>{profile.role || 'Student / Builder'}</span>
            <span><b>Account</b>{profileEmailValue ? 'Google account' : 'Local profile'}</span>
          </div>
          {profileEditing ? (
            <div className="profile-editor profile-editor-card">
              <label>
                <span>Display name</span>
                <input value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="Your name" />
              </label>
              <label>
                <span>Role / season</span>
                <input value={profileRole} onChange={e => setProfileRole(e.target.value)} placeholder="Student, researcher, builder..." />
              </label>
              <label>
                <span>Primary focus</span>
                <select value={profileFocus} onChange={e => setProfileFocus(e.target.value)}>
                  {focusChoices.map(choice => <option key={choice} value={choice}>{choice}</option>)}
                </select>
              </label>
              <label>
                <span>Work mode</span>
                <select value={profileMode} onChange={e => setProfileMode(e.target.value)}>
                  {modeChoices.map(choice => <option key={choice} value={choice}>{choice}</option>)}
                </select>
              </label>
              <label>
                <span>Timezone</span>
                <input value={profileTimezone} onChange={e => setProfileTimezone(e.target.value)} placeholder="Africa/Lagos" />
              </label>
              <div className="profile-editor-actions">
                <button type="button" className="secondary cta-animated" disabled={profileSaving || !profileName.trim()} onClick={() => void saveProfile()}>{profileSaving ? 'Saving...' : 'Save profile'}</button>
                <button type="button" className="text-link" onClick={() => {
                  setProfileName(profileNameValue);
                  setProfileRole(profile.role || '');
                  setProfileFocus(profile.focus || 'Open capture');
                  setProfileMode(profile.workMode || 'Fast capture');
                  setProfileTimezone(profileTimezoneValue);
                  setProfileEditing(false);
                }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" className="profile-edit-trigger cta-animated" onClick={() => setProfileEditing(true)}>Edit profile</button>
          )}
        </aside>

        <div className="account-sections">
          <section className="account-section">
            <div className="account-section-title">
              <Settings size={19} />
              <h2>Settings & integrations</h2>
            </div>
            <div className="integration-stack">
              <article className={integrations?.google_calendar.connected ? 'integration-card connected' : 'integration-card'}>
                <div>
                  <span className="entry-kicker">Calendar</span>
                  <h3>{statusLine(integrations?.google_calendar.connected, integrations?.google_calendar.provider_account_email)}</h3>
                  <p>Send confirmed deadlines and scheduled items to Google Calendar.</p>
                  {syncMeta(integrations?.google_calendar)}
                </div>
                <div className="integration-card-actions">
                  <button className="connect-action" type="button" onClick={() => void connectGoogle('calendar')}>{integrations?.google_calendar.connected ? 'Reconnect' : 'Connect calendar'}</button>
                  {integrations?.google_calendar.connected && <button className="text-link" disabled={syncing === 'calendar'} onClick={() => void syncGoogle('calendar')}>{syncing === 'calendar' ? 'Checking...' : 'Sync check'}</button>}
                </div>
              </article>

              <article className={integrations?.google_gmail.connected ? 'integration-card connected' : 'integration-card'}>
                <div>
                  <span className="entry-kicker">Gmail scavenging</span>
                  <h3>{statusLine(integrations?.google_gmail.connected, integrations?.google_gmail.provider_account_email)}</h3>
                  <p>Scan selected Gmail signals for deadlines, applications, and reminders.</p>
                  {syncMeta(integrations?.google_gmail)}
                </div>
                <div className="integration-card-actions">
                  <button className="connect-action" type="button" onClick={() => void connectGoogle('gmail')}>{integrations?.google_gmail.connected ? 'Reconnect' : 'Connect Gmail'}</button>
                  {integrations?.google_gmail.connected && <button className="text-link" disabled={syncing === 'gmail'} onClick={() => void syncGoogle('gmail')}>{syncing === 'gmail' ? 'Checking...' : 'Sync check'}</button>}
                </div>
              </article>
            </div>
          </section>

          <section className="account-section compact">
            <div className="account-section-title">
              <Sparkles size={19} />
              <h2>Push notifications & reminders</h2>
            </div>
            <div className="integration-card">
              <div>
                <span className="entry-kicker">Device alerts</span>
                <h3>Stay updated on upcoming deadlines</h3>
                <p>Receive scheduled prompts and habit check-ins directly on your device.</p>
              </div>
              <div className="integration-card-actions">
                <button
                  className={pushGranted ? 'connect-action connected' : 'connect-action'}
                  type="button"
                  disabled={pushGranted}
                  onClick={async () => {
                    if (!('Notification' in window)) {
                      setMessage('Notifications are not supported in this browser.');
                      return;
                    }
                    const permission = await Notification.requestPermission();
                    if (permission === 'granted') {
                      setPushGranted(true);
                      setMessage('Notifications enabled on this device.');
                    } else {
                      setMessage('Notification permission was not granted.');
                    }
                  }}
                >
                  {pushGranted ? '✓ Push notifications active' : 'Enable push reminders'}
                </button>
              </div>
            </div>
          </section>

          {configStatus && (
            <section className="account-section compact">
              <div className="account-section-title">
                <Check size={19} />
                <h2>Demo setup status</h2>
              </div>
              <div className="setup-status-grid">
                <span className="ready"><b>SQLite DB</b>Ready</span>
                <span className={configStatus.openai_configured ? 'ready' : ''}><b>OpenAI</b>{configStatus.openai_configured ? 'Ready' : 'Optional'}</span>
                <span className={configStatus.google_oauth_configured && configStatus.token_encryption_configured ? 'ready' : ''}><b>Google APIs</b>{configStatus.google_oauth_configured && configStatus.token_encryption_configured ? 'Ready' : 'Pending'}</span>
                <span className="ready"><b>SQLite Queue</b>Active</span>
                <span className={configStatus.vapid_configured ? 'ready' : ''}><b>Push keys</b>{configStatus.vapid_configured ? 'Ready' : 'Later'}</span>
              </div>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}

function SettingsPage() {
  return <AccountPage />;
}

function Empty({ icon, title, copy, action, to }: { icon: React.ReactNode; title: string; copy: string; action?: string; to?: string }) {
  return (
    <div className="empty">
      {icon}
      <h2>{title}</h2>
      <p>{copy}</p>
      {action && to && <Link className="secondary link-button" to={to}>{action} <ChevronRight size={16} /></Link>}
    </div>
  );
}

function Reminder() {
  const nav = useNavigate();
  return (
    <section className="reminder-view">
      <p className="eyebrow">A gentle nudge</p>
      <h1>Is this still relevant?</h1>
      <p>Take a moment. You can finish it, set it aside for a little while, or keep it open.</p>
      <div>
        <button className="primary" onClick={() => nav('/thoughts')}><Check /> Mark done</button>
        <button className="secondary" onClick={() => nav('/schedule')}>Snooze for an hour</button>
        <button className="text-button" onClick={() => nav('/thoughts')}>Keep it open</button>
      </div>
    </section>
  );
}

function Papers() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [working, setWorking] = useState<Record<string, string>>({});
  const [questions, setQuestions] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, { answer: string; citations: string[]; used_ai: boolean }>>({});
  const [paperMessages, setPaperMessages] = useState<Record<string, string>>({});
  const load = async () => {
    const items = await api.entries('?type=research_paper').catch(() => []);
    setEntries(items);
  };
  useEffect(() => { void load(); }, []);
  const markRead = async (entry: Entry) => {
    const updated = await api.updateStatus(entry.id, entry.status === 'done' ? 'reopen' : 'complete');
    setEntries(current => current.map(item => item.id === entry.id ? updated : item));
  };
  const enrich = async (entry: Entry) => {
    setWorking(current => ({ ...current, [entry.id]: 'enrich' }));
    setPaperMessages(current => ({ ...current, [entry.id]: '' }));
    try {
      const result = await api.enrichPaper(entry.id);
      setEntries(current => current.map(item => item.id === entry.id ? result.entry : item));
      setPaperMessages(current => ({ ...current, [entry.id]: result.message }));
    } catch (error) {
      setPaperMessages(current => ({ ...current, [entry.id]: error instanceof Error ? error.message : 'Unable to enrich this paper.' }));
    } finally {
      setWorking(current => ({ ...current, [entry.id]: '' }));
    }
  };
  const ask = async (entry: Entry) => {
    const question = (questions[entry.id] || '').trim();
    if (!question) return;
    setWorking(current => ({ ...current, [entry.id]: 'ask' }));
    try {
      const result = await api.askPaper(entry.id, question);
      setAnswers(current => ({ ...current, [entry.id]: result }));
    } catch (error) {
      setAnswers(current => ({ ...current, [entry.id]: { answer: error instanceof Error ? error.message : 'Unable to answer from this paper yet.', citations: [], used_ai: false } }));
    } finally {
      setWorking(current => ({ ...current, [entry.id]: '' }));
    }
  };

  return (
    <section className="page">
      <div className="page-heading"><div><p className="eyebrow">Your research shelf</p><h1>Papers</h1></div></div>
      <GuidedCapturePanel
        icon={<FileText size={18} />}
        kicker="Shelf shortcut"
        title="Drop a paper here, or let Capture classify it."
        copy="Paste a DOI, arXiv link, URL, or title. Capture can do the same from anywhere; this just lands it on this shelf."
        placeholder="Paste DOI, arXiv link, URL, or paper title"
        buttonLabel="Save to papers"
        buildText={value => `research paper: ${value}`}
        onSaved={load}
      />
      {entries.length ? (
        <div className="thought-list">
          {entries.map(entry => {
            const authors = metaList(entry, 'authors');
            const sourceUrl = metaText(entry, 'url');
            const paperSummary = metaText(entry, 'paper_summary');
            const bibtex = metaText(entry, 'bibtex');
            const fullTextReady = Boolean(metaText(entry, 'paper_full_text'));
            return (
            <article className="paper-row" key={entry.id}>
              <div>
                <span className="entry-kicker">{entry.status === 'done' ? 'Read' : `Captured ${relative(entry.created_at)}`}</span>
                <h3>{entry.title}</h3>
                {authors.length > 0 && <p className="paper-meta">{authors.slice(0, 5).join(', ')}</p>}
                <p>{entry.notes || 'No abstract captured yet.'}</p>
                {sourceUrl && <a className="text-link paper-link" href={sourceUrl} target="_blank" rel="noreferrer">Open source <ChevronRight size={14} /></a>}
                <div className="paper-intel-status">
                  <span className={paperSummary ? 'ready' : ''}>Summary</span>
                  <span className={fullTextReady ? 'ready' : ''}>Full text</span>
                  <span className={bibtex ? 'ready' : ''}>BibTeX</span>
                </div>
                {paperMessages[entry.id] && <p className="paper-message">{paperMessages[entry.id]}</p>}
                {paperSummary && (
                  <section className="paper-insight">
                    <span className="entry-kicker">Paper summary</span>
                    <p>{paperSummary}</p>
                  </section>
                )}
                {bibtex && (
                  <details className="paper-citation">
                    <summary>Citation / BibTeX</summary>
                    <pre>{bibtex}</pre>
                  </details>
                )}
                <div className="paper-qa">
                  <input value={questions[entry.id] || ''} onChange={event => setQuestions(current => ({ ...current, [entry.id]: event.target.value }))} placeholder="Ask this paper a question..." />
                  <button className="secondary" disabled={working[entry.id] === 'ask'} onClick={() => void ask(entry)}>{working[entry.id] === 'ask' ? 'Reading...' : 'Ask'}</button>
                </div>
                {answers[entry.id] && (
                  <section className="paper-answer">
                    <span className="entry-kicker">{answers[entry.id].used_ai ? 'AI answer' : 'Relevant excerpts'}</span>
                    <p>{answers[entry.id].answer}</p>
                  </section>
                )}
              </div>
              <div className="paper-actions">
                <button className="status-button" onClick={() => void enrich(entry)} disabled={working[entry.id] === 'enrich'}>
                  {working[entry.id] === 'enrich' ? <><Sparkles size={15} /> Enriching</> : <><Sparkles size={15} /> Enrich</>}
                </button>
                <button className="status-button" onClick={() => void markRead(entry)}>
                  {entry.status === 'done' ? <><RotateCcw size={15} /> Reopen</> : <><BookOpen size={15} /> Mark read</>}
                </button>
              </div>
            </article>
          );})}
        </div>
      ) : (
        <Empty icon={<FileText />} title="No papers saved." copy="Paste an arXiv or DOI link in Capture." action="Capture" to="/capture" />
      )}
    </section>
  );
}

function Scholarships() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [tasks, setTasks] = useState<Record<string, Entry[]>>({});
  const load = async () => {
    const items = await api.entries('?type=scholarship_app');
    setEntries(items);
    const childPairs = await Promise.all(items.map(async item => [item.id, await api.children(item.id).catch(() => [])] as const));
    setTasks(Object.fromEntries(childPairs));
  };
  useEffect(() => { void load().catch(() => setEntries([])); }, []);
  const plan = async (id: string) => {
    const result = await api.decompose(id);
    setTasks(current => ({ ...current, [id]: result.tasks }));
  };
  const completeTask = async (parentId: string, task: Entry) => {
    const updated = await api.updateStatus(task.id, task.status === 'done' ? 'reopen' : 'complete');
    setTasks(current => ({ ...current, [parentId]: (current[parentId] ?? []).map(item => item.id === task.id ? updated : item) }));
  };
  const allTasks = Object.values(tasks).flat();
  const completeTasks = allTasks.filter(task => task.status === 'done').length;
  const now = Date.now();
  const deadlineWindow = 1000 * 60 * 60 * 24 * 30;
  const urgentDeadlines = entries.filter(entry => {
    if (!entry.scheduled_at) return false;
    const due = new Date(entry.scheduled_at).getTime();
    return due >= now && due - now <= deadlineWindow;
  }).length;

  return (
    <section className="page">
      <div className="page-heading"><div><p className="eyebrow">Goals with a deadline</p><h1>Scholarships</h1></div></div>
      <div className="scholarship-cockpit">
        <article>
          <span className="entry-kicker">Active</span>
          <strong>{entries.length}</strong>
          <p>Captured opportunities.</p>
        </article>
        <article>
          <span className="entry-kicker">Upcoming</span>
          <strong>{urgentDeadlines}</strong>
          <p>Due in 30 days.</p>
        </article>
        <article>
          <span className="entry-kicker">Tasks</span>
          <strong>{completeTasks}/{allTasks.length}</strong>
          <p>Steps completed.</p>
        </article>
        <article className="wide">
          <span className="entry-kicker">AI edge</span>
          <h2>Profile fit · Essay vault · Deadline risk</h2>
          <p>Pinapeg matches opportunities to your profile, preserves essay angles, and keeps CV updates and referee nudges together.</p>
          <div className="innovation-chips">
            <span>Fit notes</span>
            <span>Essay vault</span>
            <span>Referee nudges</span>
            <span>Deadline risk</span>
          </div>
        </article>
      </div>
      <GuidedCapturePanel
        icon={<CircleHelp size={18} />}
        kicker="Shelf shortcut"
        title="Save an opportunity directly."
        copy="For when you already know it's a scholarship — skip the capture step."
        placeholder='e.g. Rhodes Scholarship deadline Oct 2'
        buttonLabel="Save to scholarships"
        buildText={value => `scholarship application: ${value}`}
        onSaved={load}
      />
      {entries.length ? (
        <div className="thought-list">
          {entries.map(entry => {
            const planTasks = tasks[entry.id] ?? [];
            const complete = planTasks.filter(task => task.status === 'done').length;
            const progress = planTasks.length ? Math.round((complete / planTasks.length) * 100) : 0;
            return (
            <article className="thought" key={entry.id}>
              <div>
                <span className="entry-kicker">{entry.scheduled_at ? `Deadline ${date(entry.scheduled_at)}` : 'Application'}</span>
                <h3>{entry.title}</h3>
                <p>{entry.notes || 'Build a clear plan before the deadline.'}</p>
                {planTasks.length > 0 && (
                  <>
                    <div className="progress-line"><span style={{ width: `${progress}%` }} /></div>
                    <ol className="task-plan actionable">
                      {planTasks.map(task => (
                        <li key={task.id}>
                          <button className={task.status === 'done' ? 'task-check done' : 'task-check'} onClick={() => void completeTask(entry.id, task)} aria-label={task.status === 'done' ? 'Reopen task' : 'Complete task'}>
                            <Check size={13} />
                          </button>
                          <span>{task.title}</span>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </div>
              <button className="status-button" onClick={() => void plan(entry.id)} disabled={planTasks.length > 0}>
                {planTasks.length > 0 ? <><Check size={15} /> {progress}% ready</> : <><ListChecks size={15} /> Build plan</>}
              </button>
            </article>
          );})}
        </div>
      ) : (
        <Empty icon={<CircleHelp />} title="No scholarship plans." copy="Confirm a scholarship goal in Capture." action="Capture" to="/capture" />
      )}
    </section>
  );
}

function CvTimeline() {
  const [entries, setEntries] = useState<Entry[]>([]);
  useEffect(() => { api.cvTimeline().then(setEntries).catch(() => setEntries([])); }, []);
  return (
    <section className="page">
      <div className="page-heading"><div><p className="eyebrow">Proof of progress</p><h1>CV timeline</h1></div></div>
      {entries.length ? (
        <div className="timeline cv-list">
          {entries.map(entry => (
            <article className="timeline-entry" key={entry.id}>
              <time>{relative(entry.created_at)}</time>
              <div><span className="entry-kicker">{metaText(entry, 'cv_category') || entry.type}</span><h3>{entry.title}</h3><p>{entry.notes || 'Completed milestone.'}</p></div>
            </article>
          ))}
        </div>
      ) : (
        <Empty icon={<Award />} title="No CV entries." copy="Completed milestones will appear here." action="View scholarships" to="/projects" />
      )}
    </section>
  );
}

function WeeklyReviewPage() {
  const [timeframe, setTimeframe] = useState('week');
  const [review, setReview] = useState<WeeklyReview | null>(null);
  useEffect(() => { api.weeklyReview(timeframe).then(setReview).catch(() => setReview(null)); }, [timeframe]);
  return (
    <section className="page recap">
      <div className="page-heading"><div><p className="eyebrow">AI accountability</p><h1>Weekly review</h1></div></div>
      <div className="segmented">
        {['week', 'month', 'all'].map(t => <button key={t} className={timeframe === t ? 'active' : ''} onClick={() => setTimeframe(t)}>Past {t === 'all' ? 'all time' : t}</button>)}
      </div>
      <p className="recap-narration">{review?.coach_narration || 'Your review will appear after you save a few entries.'}</p>
      {review ? (
        <div className="review-grid">
          <section><TrendingUp size={18} /><span>Milestones</span><strong>{review.completed_milestones.length}</strong></section>
          <section><Flame size={18} /><span>Slipping habits</span><strong>{review.slipping_habits.length}</strong></section>
          <section><BookOpen size={18} /><span>Papers read</span><strong>{review.papers_read.length}</strong></section>
          <section><Clock3 size={18} /><span>Deadlines</span><strong>{review.upcoming_deadlines.length}</strong></section>
        </div>
      ) : null}
      {review?.upcoming_deadlines.length ? (
        <section className="revisit">
          <div><p className="eyebrow">Next pressure points</p><h2>These deadlines need attention.</h2></div>
          {review.upcoming_deadlines.map(entry => <Link to={entry.type === 'scholarship_app' ? '/projects' : '/schedule'} key={entry.id}><span>{entry.scheduled_at ? date(entry.scheduled_at) : relative(entry.created_at)}</span><strong>{entry.title}</strong><ChevronRight /></Link>)}
        </section>
      ) : null}
    </section>
  );
}

function MobileNav({ onNavigate }: { onNavigate: () => void }) {
  const items = [
    ['/capture', 'Capture', Mic],
    ['/schedule', 'Schedule', CalendarDays],
    ['/history', 'History', History],
  ] as const;

  return (
    <nav className="mobile-bottom-nav" aria-label="Primary navigation">
      {items.map(([to, label, Icon]) => (
        <NavLink key={to} to={to} end onClick={onNavigate}>
          <Icon size={19} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/signin" element={<Welcome />} />
        <Route path="/signup" element={<Welcome />} />
        <Route path="/capture" element={<Capture />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/thoughts" element={<Thoughts />} />
        <Route path="/habits" element={<Habits />} />
        <Route path="/papers" element={<Papers />} />
        <Route path="/projects" element={<Scholarships />} />
        <Route path="/cv-timeline" element={<CvTimeline />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/weekly-review" element={<WeeklyReviewPage />} />
        <Route path="/recap" element={<WeeklyReviewPage />} />
        <Route path="/reminders/:id" element={<Reminder />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Welcome />} />
      </Routes>
    </Layout>
  );
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><App /></BrowserRouter></React.StrictMode>);
