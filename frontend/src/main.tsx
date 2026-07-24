import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Award,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  Flame,
  History,
  Lightbulb,
  ListChecks,
  LogOut,
  Menu,
  Mic,
  MoreHorizontal,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  TrendingUp,
  UserRound,
  X,
} from "lucide-react";
import { api } from "./api";
import {
  getCurrentAccount,
  getStoredProfile,
  signInWithGoogle,
  signOut,
  updateProfile,
} from "./auth";
import type {
  DailyEssence,
  Entry,
  Integrations,
  Proposal,
  Recap,
  WeeklyReview,
} from "./types";
import "./dev-sw-cleanup";
import "./styles.css";

const date = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(value))
    : "No time set";

const relative = (value: string) =>
  new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    new Date(value),
  );
const metaText = (entry: Entry, key: string) =>
  typeof entry.metadata?.[key] === "string" ? String(entry.metadata[key]) : "";
const metaList = (entry: Entry, key: string) =>
  Array.isArray(entry.metadata?.[key])
    ? (entry.metadata[key] as unknown[]).filter(Boolean).map(String)
    : [];

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext() {
  if (!sharedAudioCtx) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }
  }
  if (sharedAudioCtx && sharedAudioCtx.state === "suspended") {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

if (typeof window !== "undefined") {
  const unlockAudio = () => {
    getAudioContext();
    window.removeEventListener("click", unlockAudio);
    window.removeEventListener("touchstart", unlockAudio);
  };
  window.addEventListener("click", unlockAudio);
  window.addEventListener("touchstart", unlockAudio);
}

function playNotificationSound() {

  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(659.25, now);
    osc.frequency.exponentialRampToValueAtTime(987.77, now + 0.15);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.6);
  } catch {
    // Audio Context restricted before user gesture or unsupported
  }
}

export function syncScheduledAlarmsWithSW(entries: Entry[]) {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready.then((reg) => {
      entries.forEach((e) => {
        if (e.scheduled_at && e.status === "open") {
          const scheduledAtMs = new Date(e.scheduled_at).getTime();
          if (scheduledAtMs > Date.now()) {
            reg.active?.postMessage({
              type: "SCHEDULE_EVENT_ALARM",
              title: e.title,
              scheduledAtMs,
              entryId: e.id,
            });
          }
        }
      });
    });
  }
}



function Layout({ children }: { children: React.ReactNode }) {
  const [menu, setMenu] = useState(false);
  const [more, setMore] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [installDismissed, setInstallDismissed] = useState(false);
  const location = useLocation();
  const nav = useNavigate();
  const welcomePaths = new Set(["/", "/welcome", "/signin", "/signup"]);
  const isOnboarding = welcomePaths.has(location.pathname);
  const appChromeVisible = !isOnboarding && onboardingDone;
  const logoTarget = appChromeVisible ? "/capture" : "/welcome";
  const primaryItems = [
    ["/capture", "Capture", Mic],
    ["/schedule", "Schedule", CalendarDays],
    ["/history", "History", History],
  ] as const;
  const moreItems = [
    ['/thoughts', 'Thoughts', Lightbulb],
    ['/habits', 'Habits', Flame],
    ['/papers', 'Papers', FileText],
    ['/projects', 'Scholarships', CircleHelp],
    ['/weekly-review', 'Review', Sparkles],
  ] as const;
  const moreActive = moreItems.some(
    ([to]) =>
      location.pathname === to || location.pathname.startsWith(`${to}/`),
  );
  const accountActive =
    location.pathname === "/account" || location.pathname === "/settings";

  const handleSignOut = async () => {
    localStorage.removeItem("pinapeg.onboardingComplete");
    localStorage.setItem("pinapeg.signedOut", "yes");
    await signOut();
    setOnboardingDone(false);
    setMenu(false);
    setMore(false);
    nav("/welcome", { replace: true });
  };

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice?.outcome === "accepted") setInstallPrompt(null);
  };

  useEffect(() => {
    // Splash is removed after auth check resolves (see checkingAuth effect).
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () =>
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      const isSignedOut = localStorage.getItem("pinapeg.signedOut") === "yes";
      if (!isSignedOut) {
        try {
          const auth = await import("@neondatabase/auth");
          const client = auth.createAuthClient(
            import.meta.env.VITE_NEON_AUTH_URL,
          );
          const session = await client.getSession();
          const data = (session as any)?.data ?? session;
          if (data?.user) {
            localStorage.setItem("pinapeg.onboardingComplete", "yes");
            setOnboardingDone(true);
          }
        } catch (e) {
          // Not configured or not logged in.
        }
      }

      const done =
        !isSignedOut &&
        localStorage.getItem("pinapeg.onboardingComplete") === "yes";
      setOnboardingDone(done);
      setMenu(false);
      setMore(false);

      if (!isOnboarding && !done) {
        nav("/welcome", { replace: true });
      } else if (isOnboarding && done) {
        nav("/capture", { replace: true });
      }
      // Remove splash screen only now that auth is resolved.
      const splash = document.getElementById('splash-screen');
      if (splash) {
        splash.style.opacity = '0';
        splash.style.visibility = 'hidden';
        setTimeout(() => splash.remove(), 400);
      }
      setCheckingAuth(false);
    };
    checkAuth();
  }, [isOnboarding, location.pathname, nav]);

  // Auto-update Service Worker & reload app when new version is deployed
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      let refreshing = false;
      const handleControllerChange = () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      };
      navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

      navigator.serviceWorker.ready.then((reg) => {
        reg.update().catch(() => {});
        setInterval(() => reg.update().catch(() => {}), 15 * 60 * 1000);
      });

      return () => navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    }
  }, []);

  // Listen for service worker notification audio triggers
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const handleMsg = (e: MessageEvent) => {
        if (e.data?.type === "PLAY_NOTIFICATION_SOUND") {
          playNotificationSound();
        }
      };
      navigator.serviceWorker.addEventListener("message", handleMsg);
      return () => navigator.serviceWorker.removeEventListener("message", handleMsg);
    }
  }, []);


  // Schedule daily essence & checkin notifications if permission granted
  useEffect(() => {
    if ("Notification" in window && "serviceWorker" in navigator) {
      if (Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
      if (Notification.permission === "granted") {
        const savedEssence = localStorage.getItem("pinapeg.essenceTime") || "08:00";
        const savedCheckin = localStorage.getItem("pinapeg.checkinTime") || "20:00";

        navigator.serviceWorker.ready.then((reg) => {
          const [h1, m1] = savedEssence.split(":").map(Number);
          reg.active?.postMessage({
            type: "SCHEDULE_DAILY_NOTIFICATION",
            hour: h1,
            minute: m1,
          });

          const [h2, m2] = savedCheckin.split(":").map(Number);
          reg.active?.postMessage({
            type: "SCHEDULE_CHECKIN_NOTIFICATION",
            hour: h2,
            minute: m2,
          });
        });
      }
    }
  }, []);


  if (checkingAuth) {
    return (
      <div className="app-shell">
        <header>
          <div className="wordmark">
            Pinapeg<span>.</span>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header>
        <Link
          to={logoTarget}
          className="wordmark"
          onClick={() => {
            setMenu(false);
            setMore(false);
          }}
        >
          Pinapeg<span>.</span>
        </Link>
        {appChromeVisible && (
          <button
            className={`icon-button mobile-menu ${menu ? "open" : ""}`}
            onClick={() => setMenu(!menu)}
            aria-label="Menu"
            aria-expanded={menu}
          >
            <Menu />
          </button>
        )}
        {appChromeVisible && (
          <nav
            className={`top-nav ${menu ? "open" : ""}`}
            aria-label="Main navigation"
          >
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
                <button
                  className={`nav-button ${moreActive ? "active" : more ? "open" : ""}`}
                  type="button"
                  onClick={() => setMore(!more)}
                  aria-expanded={more}
                  aria-controls="desktop-more-menu"
                >
                  <MoreHorizontal size={17} />
                  <span>More</span>
                </button>
                <div
                  id="desktop-more-menu"
                  className={`more-menu ${more ? "open" : ""}`}
                >
                  {moreItems.map(([to, label, Icon]) => (
                    <NavLink
                      key={to}
                      to={to}
                      onClick={() => {
                        setMenu(false);
                        setMore(false);
                      }}
                    >
                      <Icon size={17} />
                      <span>{label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
              <NavLink
                to="/account"
                onClick={() => setMenu(false)}
                className={({ isActive }) =>
                  `account-link ${isActive || accountActive ? "active" : ""}`
                }
              >
                <UserRound size={17} />
                <span>Account</span>
              </NavLink>
              <button
                className="mobile-signout"
                type="button"
                onClick={() => void handleSignOut()}
              >
                <LogOut size={17} />
                <span>Sign out</span>
              </button>
            </div>
          </nav>
        )}
        {appChromeVisible && (
          <div className="date-stamp">
            {new Intl.DateTimeFormat(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            }).format(new Date())}
          </div>
        )}
      </header>
      <main key={location.pathname}>
        {installPrompt && !installDismissed && (
          <div className="pwa-install-banner">
            <div className="pwa-install-info">
              <Sparkles size={20} className="pwa-icon" />
              <div>
                <strong>Install Pinapeg Companion App</strong>
                <p>
                  Fast voice capture & instant offline access from your home
                  screen.
                </p>
              </div>
            </div>
            <div className="pwa-install-actions">
              <button
                type="button"
                className="cta-animated"
                onClick={handleInstallClick}
              >
                Install App
              </button>
              <button
                type="button"
                className="text-link"
                onClick={() => setInstallDismissed(true)}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        {children}
      </main>
      {appChromeVisible && (
        <MobileNav
          onNavigate={() => {
            setMenu(false);
            setMore(false);
          }}
        />
      )}
      {appChromeVisible && <DailyEssencePopup pathname={location.pathname} />}
    </div>
  );
}

function DailyEssencePopup({ pathname }: { pathname: string }) {
  const nav = useNavigate();
  const [essence, setEssence] = useState<DailyEssence | null>(null);
  const [visible, setVisible] = useState(false);
  const quietPaths = new Set(["/", "/welcome", "/signin", "/signup"]);

  useEffect(() => {
    if (quietPaths.has(pathname)) {
      setVisible(false);
      return;
    }

    let cancelled = false;
    api
      .dailyEssence()
      .then((result) => {
        const storageKey = `pinapeg.dailyEssence.${result.date}`;
        if (!cancelled && localStorage.getItem(storageKey) !== "dismissed") {
          setEssence(result);
          setVisible(true);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (!visible || !essence) return null;

  const close = () => {
    localStorage.setItem(`pinapeg.dailyEssence.${essence.date}`, "dismissed");
    setVisible(false);
  };
  const openFocus = () => {
    close();
    nav(essence.route || "/capture");
  };
  const counts = Object.entries(essence.module_counts).filter(
    ([, count]) => count > 0,
  );

  return (
    <div className="essence-dock" role="presentation">
      <section
        className="daily-essence"
        role="dialog"
        aria-modal="false"
        aria-label="Daily essence"
      >
        <button
          className="essence-close icon-button"
          onClick={close}
          aria-label="Close daily essence"
        >
          <X />
        </button>
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
            {counts.map(([label, count]) => (
              <span key={label}>
                {count} {label}
              </span>
            ))}
          </div>
        )}
        <div className="essence-actions">
          <button className="secondary" onClick={close}>
            Not now
          </button>
          <button className="primary" onClick={openFocus}>
            {essence.suggested_action} <ChevronRight size={16} />
          </button>
        </div>
      </section>
    </div>
  );
}

function Welcome() {
  const nav = useNavigate();
  const [revealStep, setRevealStep] = useState(0);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState("");
  const storedProfile = getStoredProfile();
  const [selectedFocus, setSelectedFocus] = useState(storedProfile.focus);
  const [selectedMode, setSelectedMode] = useState(storedProfile.workMode);
  const revealItems = [
    {
      id: "blank-page",
      kicker: "01 / Begin",
      title: "Start with the loose thought.",
      copy: "A thought, deadline, paper, habit, or scholarship can begin as one plain sentence, before it needs a category.",
      note: "Pinapeg keeps the first moment light.",
    },
    {
      id: "signal",
      kicker: "02 / Keep the signal",
      title: "The important parts find their way back.",
      copy: "Daily Essence, timely nudges, and a weekly review keep your signal visible without filling every corner of your day.",
      note: "A calm system, not another noisy dashboard.",
    },
    {
      id: "google",
      kicker: "03 / Your page is ready",
      title: "Bring your life into one quiet place.",
      copy: "Continue with Google to create your private Pinapeg space. You can edit your profile and connections whenever you want.",
      note: "Google gives you a secure, familiar way in.",
    },
  ] as const;
  const focusOptions = [
    "Open capture",
    "Scholarships",
    "Research",
    "Schedule",
  ] as const;
  const modeOptions = ["Fast capture", "Deep work", "Weekly review"] as const;
  const activeReveal = revealItems[revealStep];
  const revealReady = revealStep === revealItems.length - 1;
  const routeForFocus = (focus: string) =>
    focus === "Scholarships"
      ? "/projects"
      : focus === "Research"
        ? "/papers"
        : focus === "Schedule"
          ? "/schedule"
          : "/capture";

  const continueWithGoogle = async () => {
    const nextRoute = routeForFocus(selectedFocus);
    setAuthError("");
    setSigningIn(true);
    try {
      await updateProfile({ focus: selectedFocus, workMode: selectedMode });
      localStorage.setItem("pinapeg.onboardingComplete", "yes");
      const started = await signInWithGoogle(nextRoute);
      if (!started)
        throw new Error(
          "Google sign-in is not configured yet. Add VITE_NEON_AUTH_URL and enable Google in Neon Auth.",
        );
      nav(nextRoute);
    } catch (error) {
      localStorage.removeItem("pinapeg.onboardingComplete");
      setAuthError(
        error instanceof Error
          ? error.message
          : "Google sign-in could not start. Please try again.",
      );
    } finally {
      setSigningIn(false);
    }
  };
  const revealNext = () => {
    setAuthError("");
    setRevealStep((step) => Math.min(step + 1, revealItems.length - 1));
  };
  const revealPrevious = () => {
    setAuthError("");
    setRevealStep((step) => Math.max(step - 1, 0));
  };

  return (
    <section className="page auth-page welcome-page">
      <div className="paper-scene">
        <div className="paper-deck" aria-hidden="true">
          <span className="paper-underlay paper-underlay-one" />
          <span className="paper-underlay paper-underlay-two" />
        </div>
        <article
          className={`onboarding-sheet sheet-${activeReveal.id}`}
          key={activeReveal.id}
        >
          <div className="sheet-fold" aria-hidden="true" />
          <div className="sheet-topline">
            <span>Pinapeg / your personal companion</span>
            <span>
              {String(revealStep + 1).padStart(2, "0")} ?{" "}
              {String(revealItems.length).padStart(2, "0")}
            </span>
          </div>
          <div className="sheet-body">
            <div className="sheet-copy">
              <span className="entry-kicker">{activeReveal.kicker}</span>
              <h1>{activeReveal.title}</h1>
              <p>{activeReveal.copy}</p>
              <small className="sheet-note">{activeReveal.note}</small>
            </div>

            {activeReveal.id === "signal" && (
              <aside className="sheet-margin-note">
                <Sparkles size={18} />
                <span>
                  Daily Essence appears as a small, dismissible note ? only when
                  it has something useful to say.
                </span>
              </aside>
            )}
          </div>

          <footer className="sheet-footer">
            <button
              className="sheet-back"
              type="button"
              onClick={revealPrevious}
              disabled={revealStep === 0}
            >
              Back
            </button>
            <div
              className="sheet-progress"
              aria-label={`Step ${revealStep + 1} of ${revealItems.length}`}
            >
              {revealItems.map((item, index) => (
                <span
                  key={item.id}
                  className={index <= revealStep ? "active" : ""}
                />
              ))}
            </div>
            {revealReady ? (
              <div className="google-action">
                <button
                  className="google-entry"
                  type="button"
                  onClick={() => void continueWithGoogle()}
                  disabled={signingIn}
                >
                  <svg className="google-svg-logo" width="18" height="18" viewBox="0 0 18 18">
                    <path fill="#4285F4" d="M17.64 9.2c0-.74-.06-1.28-.19-1.84H9v3.34h4.96c-.1.83-.64 2.08-1.84 2.92l2.84 2.2c1.7-1.57 2.68-3.88 2.68-6.62z"/>
                    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.84-2.2c-.76.53-1.78.9-3.12.9-2.38 0-4.41-1.57-5.13-3.72L.97 13.07C2.47 16.03 5.48 18 9 18z"/>
                    <path fill="#FBBC05" d="M3.87 10.8c-.19-.53-.3-.1.1-1.8 0-.67.11-1.27.3-1.8L.97 4.93C.35 6.16 0 7.54 0 9s.35 2.84.97 4.07l2.9-2.27z"/>
                    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.34l2.58-2.58C13.46.89 11.43 0 9 0 5.48 0 2.47 1.97.97 4.93l2.9 2.27c.72-2.15 2.75-3.62 5.13-3.62z"/>
                  </svg>
                  <strong>
                    {signingIn ? "Opening Google…" : "Continue with Google"}
                  </strong>
                </button>
                {authError && (
                  <p className="auth-error" role="alert">
                    {authError}
                  </p>
                )}
              </div>
            ) : (
              <button
                className="primary sheet-next cta-animated"
                type="button"
                onClick={revealNext}
              >
                Turn the page <ChevronRight size={17} />
              </button>
            )}
          </footer>
        </article>
      </div>
    </section>
  );
}

function CaptureGuides() {
  const guides = [
    [
      "Open thought",
      "Drop the loose thing here. If it is not actionable yet, it remains a thought instead of becoming noise.",
    ],
    [
      "Research paper",
      "Paste a DOI, arXiv link, or title. Pinapeg can keep authors, abstract, source, and reading status.",
    ],
    [
      "Scholarship",
      "Name the opportunity and deadline. Pinapeg can turn it into a plan with smaller steps.",
    ],
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
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const clean = value.trim();
    if (!clean || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const proposal = await api.capture(buildText(clean));
      const entry = await api.confirm(proposal.id);
      setValue("");
      setMessage(`Saved: ${entry.title}`);
      await onSaved();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to save this entry yet.",
      );
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
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
        />
        <button
          className="cta-animated"
          type="submit"
          disabled={saving || !value.trim()}
        >
          {saving ? "Saving..." : buttonLabel}
        </button>
      </div>
      {message && <p className="guided-message">{message}</p>}
    </form>
  );
}

// ── Reusable per-entry action menu (Edit + Delete) ─────────────────────────
function ActionMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`action-menu-wrap${open ? ' open' : ''}`} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }} tabIndex={-1}>
      <button type="button" className="icon-button" onClick={() => setOpen(o => !o)} aria-label="More options" aria-expanded={open}>
        <MoreHorizontal size={17} />
      </button>
      {open && (
        <div className="action-menu" role="menu">
          <button role="menuitem" onClick={() => { onEdit(); setOpen(false); }}><FileText size={13} /> Edit</button>
          <button role="menuitem" className="action-menu-danger" onClick={() => { onDelete(); setOpen(false); }}><X size={13} /> Delete</button>
        </div>
      )}
    </div>
  );
}


function InlineEdit({ initialTitle, initialNotes, onSave, onCancel }: { initialTitle: string; initialNotes: string; onSave: (title: string, notes: string) => void; onCancel: () => void }) {
  const [t, setT] = useState(initialTitle);
  const [n, setN] = useState(initialNotes);
  return (
    <div className="inline-edit-form">
      <input className="inline-edit-input" value={t} onChange={e => setT(e.target.value)} />
      <textarea className="inline-edit-textarea" value={n} onChange={e => setN(e.target.value)} rows={2} placeholder="Notes (optional)" />
      <div className="inline-edit-actions">
        <button className="secondary" onClick={() => onSave(t.trim(), n.trim())}>Save</button>
        <button className="text-link" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

function Capture() {
  const [input, setInput] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [showMicModal, setShowMicModal] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const profile = getStoredProfile();
  const presets = [
    { key: "Thought", label: "Thought", icon: Lightbulb, prefix: "I have been thinking about ", placeholder: "Describe a loose thought or idea (e.g. A new approach for handling offline sync)...", hint: "Expected input: A loose thought, note, or idea you want to record." },
    { key: "Paper", label: "Paper", icon: FileText, prefix: "research paper: ", placeholder: "Paste an arXiv link, DOI, or paper title (e.g. 2310.03714 or Attention is All You Need)...", hint: "Expected input: arXiv URL/ID, DOI, or Research paper title." },
    { key: "Scholarship", label: "Scholarship", icon: CircleHelp, prefix: "scholarship: ", placeholder: "Paste a scholarship link or type details (e.g. Gates Cambridge deadline Oct 12)...", hint: "Expected input: Scholarship URL, program name, or application deadline." },
    { key: "Habit", label: "Habit", icon: Flame, prefix: "daily habit: ", placeholder: "Name a daily habit or practice (e.g. Read 20 mins every morning)...", hint: "Expected input: A daily practice or habit you want to log." },
  ] as const;

  const currentPreset = presets.find(p => p.key === activeCategory);
  const activePlaceholder = currentPreset
    ? currentPreset.placeholder
    : "e.g. Book design sync Friday at 10, paste a paper link, or start a scholarship plan...";

  const handleCategorySelect = (key: string, prefix: string) => {
    if (activeCategory === key) {
      setActiveCategory(null);
      setInput("");
    } else {
      setActiveCategory(key);
      setInput(prefix);
    }
  };

  const startRecordingDirectly = async (prefixOverride?: string) => {
    setShowMicModal(false);
    if (prefixOverride !== undefined) {
      setInput(prev => prev ? `${prev.trim()} ${prefixOverride}` : prefixOverride);
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const instance = new MediaRecorder(stream);
      recorder.current = instance;
      instance.ondataavailable = (e) => chunks.push(e.data);
      instance.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunks, {
          type: instance.mimeType || "audio/webm",
        });
        setLoading(true);
        setVoiceStatus("Preparing voice note...");
        try {
          setVoiceStatus("Preparing transcript...");
          const res = await api.captureAudio(blob, { focus: profile.focus, workMode: profile.workMode, role: profile.role });
          setProposal(res);
          setInput((prev) => {
            const added = res.title || "";
            if (!prev.trim()) return added;
            return `${prev.trim()} ${added}`;
          });
        } catch (e) {
          setError(
            e instanceof Error
              ? e.message
              : "Unable to process this recording.",
          );
        } finally {
          setVoiceStatus("");
          setLoading(false);
        }
      };
      instance.start();
      setRecording(true);
      setVoiceStatus("");
    } catch {
      setError(
        "Microphone permission was not granted. You can still type your thought below.",
      );
    }
  };

  const toggleRecord = () => {
    if (recording) {
      recorder.current?.stop();
    } else {
      setShowMicModal(true);
    }
  };

  const submit = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError("");
    try {
      setProposal(await api.capture(input, { focus: profile.focus, workMode: profile.workMode, role: profile.role }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to understand that.");
    } finally {
      setLoading(false);
    }
  };


  return (
    <>
      <section className="capture">
        <p className="eyebrow">A place to put the things you want to keep</p>
        <h1>What's on your mind?</h1>
        <p className="lede">
          Say it plainly. We'll hold onto the details and bring them back when
          they matter.
        </p>
        <div className={`orb ${recording ? "recording" : ""}`}>
          <button
            className="mic-button"
            onClick={toggleRecord}
            aria-label={recording ? "Stop recording" : "Start voice capture"}
          >
            <Mic size={42} />
          </button>
          {!recording && <span className="mic-prompt">Tap to speak</span>}
          {recording && (
            <span className="recording-label">
              Listening <i />
              <i />
              <i />
            </span>
          )}
        </div>

        {showMicModal && (
          <div className="mic-modal-overlay" onClick={() => setShowMicModal(false)}>
            <div className="mic-modal-card" onClick={e => e.stopPropagation()}>
              <div className="mic-modal-header">
                <Sparkles size={20} className="mic-modal-sparkle" />
                <h3>What are you capturing?</h3>
                <p>Select a category to lock voice routing, or tap Speak Freely.</p>
              </div>
              <div className="mic-modal-grid">
                <button type="button" className="mic-modal-chip" onClick={() => void startRecordingDirectly("I have been thinking about ")}>
                  <Lightbulb size={18} />
                  <span>Thought</span>
                </button>
                <button type="button" className="mic-modal-chip" onClick={() => void startRecordingDirectly("schedule event: ")}>
                  <CalendarDays size={18} />
                  <span>Event</span>
                </button>
                <button type="button" className="mic-modal-chip" onClick={() => void startRecordingDirectly("reminder: ")}>
                  <Check size={18} />
                  <span>Task</span>
                </button>
                <button type="button" className="mic-modal-chip" onClick={() => void startRecordingDirectly("daily habit: ")}>
                  <Flame size={18} />
                  <span>Habit</span>
                </button>
              </div>

              <div className="mic-modal-actions">
                <button type="button" className="secondary" onClick={() => void startRecordingDirectly()}>
                  🎙️ Speak Freely
                </button>
                <button type="button" className="text-link" onClick={() => setShowMicModal(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="capture-rule">
          <span>or write it down</span>
        </div>

        <div className="quick-capture">
          {presets.map(({ key, label, icon: Icon, prefix }) => {
            const isSelected = activeCategory === key;
            return (
              <button
                key={label}
                type="button"
                className={isSelected ? "quick-chip active" : "quick-chip"}
                onClick={() => handleCategorySelect(key, prefix)}
              >
                <Icon size={15} />
                {label}
                {isSelected && <span className="active-dot" />}
              </button>
            );
          })}
        </div>
        {currentPreset && (
          <div className="category-guide-bar">
            <Sparkles size={14} className="guide-sparkle" />
            <span>{currentPreset.hint}</span>
          </div>
        )}
        <div className="composer">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submit();
            }}
            placeholder={activePlaceholder}
            rows={3}
          />
          <button
            className="send cta-animated"
            disabled={loading || !input.trim()}
            onClick={() => void submit()}
          >
            {loading ? (
              <span className="processing-inline">Thinking<span className="dot-pulse" /></span>
            ) : (
              <>
                Continue <ChevronRight size={17} />
              </>
            )}
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {loading && voiceStatus && (
          <div className="processing-status" role="status" aria-live="polite">
            <span className="processing-orb" aria-hidden="true" />
            <span>{voiceStatus}</span>
          </div>
        )}
        <p className="hint">
          Your capture is private. Nothing is scheduled or changed until you
          confirm.
        </p>
        <CaptureGuides />
      </section>
      {proposal && (
        <ProposalSheet
          proposal={proposal}
          close={() => setProposal(null)}
          reset={() => setInput("")}
          onEdit={(text) => {
            setProposal(null);
            setInput(text);
          }}
        />
      )}
    </>
  );
}

function ProposalSheet({
  proposal,
  close,
  reset,
  onEdit,
}: {
  proposal: Proposal;
  close: () => void;
  reset: () => void;
  onEdit?: (text: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const nav = useNavigate();
  const isQuery = proposal.intent === "QUERY";
  const labels: Record<Proposal["intent"], string> = {
    CREATE: "A calendar moment",
    REMINDER_ONLY: "A reminder to keep",
    OPEN_THOUGHT: "An open thought",
    QUERY: "From your memory",
    TRACK_PAPER: "A paper to keep close",
    TRACK_SCHOLARSHIP: "A scholarship to pursue",
    LOG_HABIT: "A habit to build",
  };
  const destination = proposal.resolves_entry_id
    ? { to: "/thoughts", label: "Open thoughts" }
    : proposal.intent === "TRACK_PAPER"
      ? { to: "/papers", label: "Open papers" }
      : proposal.intent === "TRACK_SCHOLARSHIP"
        ? { to: "/projects", label: "Open scholarships" }
        : proposal.intent === "LOG_HABIT"
          ? { to: "/habits", label: "Open habits" }
          : proposal.intent === "CREATE" || proposal.intent === "REMINDER_ONLY"
            ? { to: "/schedule", label: "Open schedule" }
            : { to: "/thoughts", label: "Open thoughts" };

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
        <button
          className="sheet-close icon-button"
          onClick={close}
          aria-label="Close"
        >
          <X />
        </button>
        {done ? (
          <div className="saved">
            <div className="saved-mark">
              <Check />
            </div>
            <p className="eyebrow">Saved gently</p>
            <h2>It's with you now.</h2>
            <div className="saved-actions">
              <button
                className="primary"
                onClick={() => {
                  close();
                  nav(destination.to);
                }}
              >
                {destination.label}
              </button>
              <button className="secondary" onClick={close}>
                Capture another
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="eyebrow">{labels[proposal.intent]}</p>
            {proposal.intent === "TRACK_PAPER" ? (
              <div className="paper-proposal-preview">
                <h2 className="paper-proposal-title">{proposal.title}</h2>
                {proposal.notes && (
                  <div className="paper-proposal-abstract">
                    <span className="entry-kicker">Abstract / notes</span>
                    <p>{proposal.notes}</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <h2 style={{ fontSize: '1rem', fontWeight: 400, whiteSpace: 'pre-wrap', margin: '0 0 16px 0' }}>{proposal.title}</h2>
                {proposal.datetime && (
                  <p className="proposal-time">
                    <Clock3 size={17} />
                    {date(proposal.datetime)}
                  </p>
                )}
                {proposal.notes && (
                  <p className="proposal-notes">{proposal.notes}</p>
                )}
              </>
            )}


            {isQuery ? (
              <>
                <p className="answer">{proposal.answer}</p>
                <button className="primary" onClick={close}>
                  Done
                </button>
              </>
            ) : (
              <div className="sheet-actions">
                <button
                  className="secondary"
                  onClick={() => {
                    if (onEdit) {
                      const text = [proposal.title, proposal.notes]
                        .filter(Boolean)
                        .join("\n");
                      onEdit(text);
                    } else {
                      close();
                    }
                  }}
                >
                  {onEdit ? "Edit text" : "Keep editing"}
                </button>
                <button
                  className="primary"
                  onClick={() => void confirm()}
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : proposal.resolves_entry_id
                      ? "Confirm update"
                      : "Confirm"}
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
  const [weekOffset, setWeekOffset] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [calendarConnected, setCalendarConnected] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const load = () => api.schedule().then(res => { setEntries(res); syncScheduledAlarmsWithSW(res); }).catch(() => setEntries([]));


  useEffect(() => {
    void load();
    api.integrations().then(d => setCalendarConnected(d.google_calendar.connected)).catch(() => {});
  }, []);

  const syncCalendar = async () => {
    setSyncing(true); setSyncMsg('');
    try {
      const result = await api.googleSync('calendar');
      setSyncMsg(result.message);
      void load();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Sync failed.');
    } finally { setSyncing(false); }
  };

  const [addingItem, setAddingItem] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [savingItem, setSavingItem] = useState(false);

  const addScheduleItem = async () => {
    if (!newTitle.trim() || !newDate) return;
    setSavingItem(true);
    try {
      const selectedIso = new Date(newDate).toISOString();
      const formattedDate = new Date(newDate).toLocaleString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
      });
      const text = `schedule event: ${newTitle.trim()} on ${formattedDate}${newNotes.trim() ? ` notes: ${newNotes.trim()}` : ''}`;
      const proposal = await api.capture(text);
      const entry = await api.confirm(proposal.id);
      await api.updateEntry(entry.id, { scheduled_at: selectedIso });

      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SCHEDULE_EVENT_ALARM',
          title: entry.title,
          scheduledAtMs: new Date(selectedIso).getTime(),
          entryId: entry.id,
        });
      }

      setNewTitle(''); setNewDate(''); setNewNotes(''); setAddingItem(false);
      void load();
    } catch {
      // handle error
    } finally {
      setSavingItem(false);
    }
  };


  const startEdit = (e: Entry) => {
    setEditingId(e.id);
    setEditTitle(e.title);
    setEditNotes(e.notes || '');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await api.updateEntry(editingId, { title: editTitle.trim(), notes: editNotes.trim() || undefined });
    setEditingId(null);
    void load();
  };

  // Week boundaries (Monday-first)
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const mondayShift = dow === 0 ? -6 : 1 - dow;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() + mondayShift + weekOffset * 7);
  const weekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d; });

  const keyFor = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const todayKey = keyFor(today);
  const entriesForDay = (d: Date) =>
    entries
      .filter(e => e.scheduled_at && keyFor(new Date(e.scheduled_at)) === keyFor(d))
      .sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime());

  const allSortedEntries = [...entries]
    .filter(e => e.scheduled_at)
    .sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime());

  const weekLabel = `${weekDays[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const kindLabel = (entry: Entry) => ({
    event: 'Event', task: 'Reminder', thought: 'Thought',
    scholarship_app: 'Scholarship', research_paper: 'Research',
    habit: 'Habit', project_milestone: 'Milestone',
  }[entry.type] ?? 'Item');

  return (
    <section className="page">
      <div className="page-heading">
        <div><p className="eyebrow">Your time, held clearly</p><h1>Schedule</h1></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="secondary" onClick={() => setAddingItem(a => !a)}>
            {addingItem ? 'Cancel' : '+ Add task / event'}
          </button>
          {calendarConnected && (
            <button className="secondary" onClick={() => void syncCalendar()} disabled={syncing}>
              {syncing ? <><RotateCcw size={14} /> Syncing…</> : 'Sync calendar'}
            </button>
          )}
        </div>
      </div>

      {addingItem && (
        <div className="integration-card" style={{ marginBottom: 24, padding: 20 }}>
          <span className="entry-kicker">New Schedule Item</span>
          <div className="history-edit-form" style={{ marginTop: 12 }}>
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Event or task title (e.g. Team Meeting, Exam…)"
              className="history-edit-input"
              autoFocus
            />
            <input
              type="datetime-local"
              value={newDate}
              onChange={e => setNewDate(e.target.value)}
              className="history-edit-input"
              style={{ marginTop: 8 }}
            />
            <textarea
              value={newNotes}
              onChange={e => setNewNotes(e.target.value)}
              placeholder="Notes or details (optional)"
              className="history-edit-textarea"
              rows={2}
              style={{ marginTop: 8 }}
            />
            <div className="history-edit-actions" style={{ marginTop: 12 }}>
              <button
                className="secondary"
                disabled={savingItem || !newTitle.trim() || !newDate}
                onClick={() => void addScheduleItem()}
              >
                {savingItem ? 'Saving…' : 'Add to schedule'}
              </button>
              <button className="text-link" onClick={() => setAddingItem(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="agenda-nav">
        <button type="button" className="icon-button" onClick={() => setWeekOffset(w => w - 1)} aria-label="Previous week"><ChevronLeft size={18} /></button>
        <span className="agenda-week-label">{weekLabel}</span>
        <button type="button" className="icon-button" onClick={() => setWeekOffset(w => w + 1)} aria-label="Next week"><ChevronRight size={18} /></button>
        {weekOffset !== 0 && <button type="button" className="secondary" onClick={() => setWeekOffset(0)}>Today</button>}
      </div>

      {syncMsg && <p className="hint">{syncMsg}</p>}

      <div className="agenda-week">
        {weekDays.map(day => {
          const key = keyFor(day);
          const isToday = key === todayKey;
          const isPast = day < today && !isToday;
          const dayEntries = entriesForDay(day);
          return (
            <div key={key} className={['agenda-day', isToday && 'agenda-today', isPast && 'agenda-past', dayEntries.length === 0 && 'agenda-quiet'].filter(Boolean).join(' ')}>
              <div className="agenda-day-hd">
                <div className="agenda-day-id">
                  <span className="agenda-dow">{day.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                  <span className="agenda-dom">{day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  {isToday && <span className="agenda-now-tag">Today</span>}
                </div>
                {dayEntries.length > 0 && <span className="agenda-item-count">{dayEntries.length} item{dayEntries.length !== 1 ? 's' : ''}</span>}
              </div>
              {dayEntries.length > 0 ? (
                <ul className="agenda-items">
                  {dayEntries.map(entry => (
                    <li key={entry.id} className={`agenda-item${entry.type !== 'event' ? ' agenda-item-deadline' : ''}`}>
                      <time className="agenda-time">
                        {entry.scheduled_at
                          ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(entry.scheduled_at))
                          : 'All day'}
                      </time>
                      <span className="agenda-dot" />
                      {editingId === entry.id ? (
                        <div className="history-edit-form" style={{ flex: 1 }}>
                          <input value={editTitle} onChange={ev => setEditTitle(ev.target.value)} className="history-edit-input" />
                          <textarea value={editNotes} onChange={ev => setEditNotes(ev.target.value)} className="history-edit-textarea" rows={2} placeholder="Notes (optional)" />
                          <div className="history-edit-actions">
                            <button className="secondary" onClick={() => void saveEdit()}>Save</button>
                            <button className="text-link" onClick={() => setEditingId(null)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="agenda-body">
                          <span className="entry-kicker">{kindLabel(entry)}</span>
                          <p className="agenda-title">{entry.title}</p>
                          {entry.notes && <p className="agenda-notes">{entry.notes}</p>}
                        </div>
                      )}
                      <ActionMenu
                        onEdit={() => startEdit(entry)}
                        onDelete={() => { void api.deleteEntry(entry.id).then(() => void load()); }}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="agenda-quiet-label">Nothing scheduled</p>
              )}
            </div>
          );
        })}
      </div>

      {allSortedEntries.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div className="page-heading">
            <div>
              <p className="eyebrow">Complete Agenda</p>
              <h2>All Scheduled Items ({allSortedEntries.length})</h2>
            </div>
          </div>
          <div className="history-list">
            {allSortedEntries.map(e => (
              <article key={e.id} className={editingId === e.id ? 'history-editing' : ''}>
                <span>{date(e.scheduled_at)}</span>
                {editingId === e.id ? (
                  <div className="history-edit-form">
                    <input value={editTitle} onChange={ev => setEditTitle(ev.target.value)} className="history-edit-input" />
                    <textarea value={editNotes} onChange={ev => setEditNotes(ev.target.value)} className="history-edit-textarea" rows={2} placeholder="Notes (optional)" />
                    <div className="history-edit-actions">
                      <button className="secondary" onClick={() => void saveEdit()}>Save</button>
                      <button className="text-link" onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <span className="entry-kicker">{kindLabel(e)}</span>
                    <h3>{e.title}</h3>
                    {e.notes && <p>{e.notes}</p>}
                  </div>
                )}
                <ActionMenu
                  onEdit={() => startEdit(e)}
                  onDelete={() => { void api.deleteEntry(e.id).then(() => void load()); }}
                />
              </article>
            ))}
          </div>
        </div>
      )}

      {entries.length === 0 && (
        <Empty icon={<CalendarDays />} title="No upcoming items." copy="Capture a deadline, event, or scholarship to see it here." action="Capture item" to="/capture" />
      )}
    </section>
  );
}

function Thoughts() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [filter, setFilter] = useState<"open" | "resolved">("open");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const load = () =>
    api
      .entries(`?type=thought&status=${filter}`)
      .then(setEntries)
      .catch(() => setEntries([]));
  useEffect(() => {
    void load();
  }, [filter]);

  const resolve = async (entry: Entry) => {
    await api.updateStatus(entry.id, entry.status === 'open' ? 'resolve' : 'reopen');
    void load();
  };

  const startEdit = (e: Entry) => {
    setEditingId(e.id);
    setEditTitle(e.title);
    setEditNotes(e.notes || "");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await api.updateEntry(editingId, { title: editTitle.trim(), notes: editNotes.trim() || undefined });
    setEditingId(null);
    void load();
  };

  const [searchQ, setSearchQ] = useState('');
  const visible = entries.filter(e =>
    !searchQ || e.title.toLowerCase().includes(searchQ.toLowerCase()) || (e.notes || '').toLowerCase().includes(searchQ.toLowerCase())
  );

  return (
    <section className="page">
      <div className="page-heading">
        <div><h1>Thoughts</h1></div>
      </div>
      <div className="thoughts-toolbar">
        <div className="segmented">
          <button className={filter === 'open' ? 'active' : ''} onClick={() => setFilter('open')}>Open</button>
          <button className={filter === 'resolved' ? 'active' : ''} onClick={() => setFilter('resolved')}>Resolved</button>
        </div>
        <label className="thought-search">
          <Search size={15} />
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search..." />
        </label>
      </div>
      {visible.length ? (
        <div className="thought-grid">
          {visible.map(e => (
            <article className="thought-card" key={e.id}>
              <div className="thought-card-top">
                <time className="thought-age">{relative(e.created_at)}</time>
                <ActionMenu
                  onEdit={() => startEdit(e)}
                  onDelete={() => { void api.deleteEntry(e.id).then(() => void load()); }}
                />
              </div>
              {editingId === e.id ? (
                <div className="history-edit-form" style={{ width: '100%', margin: '12px 0' }}>
                  <input value={editTitle} onChange={ev => setEditTitle(ev.target.value)} className="history-edit-input" />
                  <textarea value={editNotes} onChange={ev => setEditNotes(ev.target.value)} className="history-edit-textarea" rows={2} placeholder="Notes (optional)" />
                  <div className="history-edit-actions" style={{ marginTop: 8 }}>
                    <button className="secondary" onClick={() => void saveEdit()}>Save</button>
                    <button className="text-link" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="thought-card-body">
                  <h3>{e.title}</h3>
                  {e.notes && <p>{e.notes}</p>}
                </div>
              )}
              <button className="status-button thought-card-action" onClick={() => void resolve(e)}>
                {e.status === 'open' ? <><Check size={14} /> Resolve</> : <><RotateCcw size={14} /> Reopen</>}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <Empty icon={<Lightbulb />} title={filter === 'open' ? 'No open thoughts.' : 'Nothing resolved yet.'} copy="Thoughts you capture without a date land here." action="Capture thought" to="/capture" />
      )}
    </section>
  );
}


function Habits() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [logged, setLogged] = useState<Set<string>>(new Set());
  const [metrics, setMetrics] = useState<
    Record<
      string,
      { logged_days: number; completion_rate: number; current_streak: number }
    >
  >({});
  const refreshMetrics = () =>
    api
      .habitAnalytics()
      .then((result) => {
        setMetrics(
          Object.fromEntries(
            result.habits.map((metric) => [metric.habit_entry_id, metric]),
          ),
        );
      })
      .catch(() => setMetrics({}));
  const load = async () => {
    const items = await api.entries("?type=habit&status=open").catch(() => []);
    setEntries(items);
    void refreshMetrics();
  };
  useEffect(() => {
    void load();
  }, []);
  const log = async (id: string) => {
    await api.logHabit(id);
    setLogged((current) => new Set(current).add(id));
    void refreshMetrics();
  };

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Habits</h1>
        </div>
      </div>
      <GuidedCapturePanel
        icon={<Flame size={18} />}
        kicker="Shelf shortcut"
        title="Save a habit quickly."
        copy="Add daily habits to your shelf."
        placeholder="e.g. Read one research page every evening"
        buttonLabel="Save to habits"
        buildText={(value) => `daily habit: ${value}`}
        onSaved={load}
      />
      {entries.length ? (
        <div className="thought-list">
          {entries.map((entry) => (
            <article className="thought" key={entry.id}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span className="entry-kicker">Daily practice</span>
                  <ActionMenu
                    onEdit={() => { /* future */ }}
                    onDelete={() => { void api.deleteEntry(entry.id).then(() => void load()); }}
                  />
                </div>
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
        <Empty
          icon={<Flame />}
          title="No habits."
          copy="Add a daily practice to start tracking."
          action="Add habit"
          to="/capture"
        />
      )}
    </section>
  );
}

function HistoryPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [q, setQ] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const load = () => api.entries(q ? `?q=${encodeURIComponent(q)}` : '').then(setEntries).catch(() => setEntries([]));
  useEffect(() => { void load(); }, [q]);

  const startEdit = (e: Entry) => {
    setEditingId(e.id);
    setEditTitle(e.title);
    setEditNotes(e.notes || '');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await api.updateEntry(editingId, { title: editTitle.trim(), notes: editNotes.trim() || undefined });
    setEditingId(null);
    void load();
  };

  return (
    <section className="page">
      <div className="page-heading"><div><h1>History</h1></div></div>
      <label className="search">
        <Search size={18} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search captures" />
      </label>
      <div className="history-list">
        {entries.map(e => (
          <article key={e.id} className={editingId === e.id ? 'history-editing' : ''}>
            <span>{relative(e.created_at)}</span>
            {editingId === e.id ? (
              <div className="history-edit-form">
                <input value={editTitle} onChange={ev => setEditTitle(ev.target.value)} className="history-edit-input" />
                <textarea value={editNotes} onChange={ev => setEditNotes(ev.target.value)} className="history-edit-textarea" rows={2} placeholder="Notes (optional)" />
                <div className="history-edit-actions">
                  <button className="secondary" onClick={() => void saveEdit()}>Save</button>
                  <button className="text-link" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div>
                <h3>{e.title}</h3>
                <p>{e.notes || (e.scheduled_at && date(e.scheduled_at))}</p>
              </div>
            )}
            <ActionMenu
              onEdit={() => startEdit(e)}
              onDelete={() => { void api.deleteEntry(e.id).then(() => void load()); }}
            />
          </article>
        ))}
      </div>
    </section>
  );
}

function RecapPage() {
  const [timeframe, setTimeframe] = useState("week");
  const [recap, setRecap] = useState<Recap | null>(null);
  useEffect(() => {
    api
      .recap(timeframe)
      .then(setRecap)
      .catch(() =>
        setRecap({
          timeframe,
          completed: [],
          still_open: [],
          worth_revisiting: [],
          narration: "Your recap will appear once you've saved a few moments.",
        }),
      );
  }, [timeframe]);

  return (
    <section className="page recap">
      <div className="page-heading">
        <div>
          <p className="eyebrow">A moment to look back</p>
          <h1>Your recap</h1>
        </div>
      </div>
      <div className="segmented">
        {["week", "month", "all"].map((t) => (
          <button
            key={t}
            className={timeframe === t ? "active" : ""}
            onClick={() => setTimeframe(t)}
          >
            Past {t === "all" ? "all time" : t}
          </button>
        ))}
      </div>
      <p className="recap-narration">{recap?.narration}</p>
      {recap?.worth_revisiting.length ? (
        <section className="revisit">
          <div>
            <p className="eyebrow">Worth revisiting</p>
            <h2>You mentioned these and haven't returned to them.</h2>
          </div>
          {recap.worth_revisiting.map((e) => (
            <Link to="/thoughts" key={e.id}>
              <span>{relative(e.created_at)}</span>
              <strong>{e.title}</strong>
              <ChevronRight />
            </Link>
          ))}
        </section>
      ) : (
        <Empty
          icon={<Sparkles />}
          title="No threads to revisit."
          copy="Forgotten thoughts will surface here automatically."
        />
      )}
    </section>
  );
}

function AccountPage() {
  const [me, setMe] = useState<{
    display_name: string;
    timezone: string;
    calendar_connected: boolean;
  } | null>(null);
  const [account, setAccount] = useState<{
    name?: string;
    email?: string;
  } | null>(null);
  const [profile, setProfile] = useState(() => getStoredProfile());
  const [integrations, setIntegrations] = useState<Integrations | null>(null);

  const [message, setMessage] = useState("");
  const [syncing, setSyncing] = useState<"calendar" | "gmail" | "">("");
  const [profileName, setProfileName] = useState("");
  const [profileRole, setProfileRole] = useState("");
  const [profileFocus, setProfileFocus] = useState("");
  const [profileMode, setProfileMode] = useState("");
  const [profileTimezone, setProfileTimezone] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [pushGranted, setPushGranted] = useState(
    () =>
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted",
  );
  const [profileEditing, setProfileEditing] = useState(false);
  const [essenceTime, setEssenceTime] = useState(
    () => localStorage.getItem("pinapeg.essenceTime") || "08:00",
  );
  const [timeSaved, setTimeSaved] = useState(false);
  const [checkinTime, setCheckinTime] = useState(
    () => localStorage.getItem("pinapeg.checkinTime") || "20:00",
  );
  const [checkinSaved, setCheckinSaved] = useState(false);
  const focusChoices = [
    "Open capture",
    "Scholarships",
    "Research",
    "Schedule",
  ] as const;
  const modeChoices = ["Fast capture", "Deep work", "Weekly review"] as const;
  const location = useLocation();
  useEffect(() => {
    api
      .me()
      .then(setMe)
      .catch(() =>
        setMe({
          display_name: "You",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          calendar_connected: false,
        }),
      );
    api
      .integrations()
      .then(setIntegrations)
      .catch(() => setIntegrations(null));
    void getCurrentAccount().then((user) => {
      const stored = getStoredProfile();
      // Prefer stored name if user has customised it; otherwise fall back to account name.
      const resolvedName = stored.name && stored.name !== 'You' ? stored.name : (user?.name || stored.name);
      const mergedProfile = {
        ...stored,
        name: resolvedName,
        email: user?.email || stored.email,
        timezone:
          stored.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      setAccount(user);
      setProfile(mergedProfile);
      setProfileName(resolvedName || '');
      setProfileRole(mergedProfile.role || '');
      setProfileFocus(mergedProfile.focus || 'Open capture');
      setProfileMode(mergedProfile.workMode || 'Fast capture');
      setProfileTimezone(mergedProfile.timezone || '');
      void updateProfile(mergedProfile);
    });
    const params = new URLSearchParams(location.search);
    if (params.get("google") === "connected")
      setMessage(`${params.get("provider") || "Google"} connected.`);
    if (params.get("google") === "error")
      setMessage(params.get("message") || "Google connection failed.");
  }, [location.search]);
  const connectGoogle = async (provider: "calendar" | "gmail") => {
    try {
      const result = await api.googleConnect(provider);
      window.location.href = result.authorization_url;
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Unable to start Google connection.",
      );
    }
  };
  const syncGoogle = async (provider: "calendar" | "gmail") => {
    setSyncing(provider);
    setMessage("");
    try {
      const result = await api.googleSync(provider);
      setMessage(result.message);
      setIntegrations(await api.integrations());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to run sync check.");
    } finally {
      setSyncing("");
    }
  };
  const statusLine = (connected?: boolean, email?: string | null) =>
    connected ? `Connected${email ? ` as ${email}` : ""}` : "Not connected";
  const saveProfile = async () => {
    if (!profileName.trim()) return;
    setProfileSaving(true);
    setMessage("");
    try {
      const updated = await updateProfile({
        name: profileName.trim(),
        role: profileRole.trim() || "Student / Builder",
        focus: profileFocus || "Open capture",
        workMode: profileMode || "Fast capture",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setProfile(updated);
      setAccount((current) => ({
        name: updated.name,
        email: updated.email || current?.email,
      }));
      setMessage("Profile updated.");
      setProfileEditing(false);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to update profile.");
    } finally {
      setProfileSaving(false);
    }
  };
  const saveEssenceTime = () => {
    localStorage.setItem("pinapeg.essenceTime", essenceTime);
    if ("serviceWorker" in navigator) {
      const [hStr, mStr] = essenceTime.split(":");
      navigator.serviceWorker.ready.then((reg) => {
        reg.active?.postMessage({
          type: "SCHEDULE_DAILY_NOTIFICATION",
          hour: parseInt(hStr, 10),
          minute: parseInt(mStr, 10),
        });
      });
    }
    setTimeSaved(true);
    setTimeout(() => setTimeSaved(false), 2500);
  };
  const saveCheckinTime = () => {
    localStorage.setItem("pinapeg.checkinTime", checkinTime);
    if ("serviceWorker" in navigator) {
      const [hStr, mStr] = checkinTime.split(":");
      navigator.serviceWorker.ready.then((reg) => {
        reg.active?.postMessage({
          type: "SCHEDULE_CHECKIN_NOTIFICATION",
          hour: parseInt(hStr, 10),
          minute: parseInt(mStr, 10),
        });
      });
    }
    setCheckinSaved(true);
    setTimeout(() => setCheckinSaved(false), 2500);
  };
  const triggerTestNotification = () => {
    playNotificationSound();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.active?.postMessage({
          type: "TRIGGER_TEST_NOTIFICATION",
          title: "Pinapeg · Notification & Sound Test",
          body: "Notifications and audio chimes are working perfectly!",
        });
      });
    } else if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Pinapeg · Notification & Sound Test", {
        body: "Notifications and audio chimes are working perfectly!",
      });
    }
  };

  const syncMeta = (connection?: Integrations["google_calendar"]) => (
    <>
      {connection?.last_synced_at && (
        <small className="integration-meta">
          Last checked {date(connection.last_synced_at)}
        </small>
      )}
      {connection?.last_error && (
        <small className="integration-meta error">
          Last error: {connection.last_error}
        </small>
      )}
    </>
  );

  const profileNameValue =
    profile.name || account?.name || me?.display_name || "You";
  const profileEmailValue = profile.email || account?.email;
  const profileTimezoneValue =
    profile.timezone ||
    me?.timezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone;

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
          {profileEditing ? (
            /* ── Edit mode: replaces card content entirely ── */
            <div className="profile-edit-mode">
              <span className="entry-kicker">Edit profile</span>
              <div className="profile-editor">
                <label>
                  <span>Display name</span>
                  <input value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="Your name" autoFocus />
                </label>
                <label>
                  <span>Role / bio</span>
                  <input value={profileRole} onChange={e => setProfileRole(e.target.value)} placeholder="PhD researcher, Lagos…" />
                </label>
              </div>
              <details className="ai-prefs-details">
                <summary>AI preferences</summary>
                <div className="profile-editor">
                  <label>
                    <span>Primary focus</span>
                    <select value={profileFocus} onChange={e => setProfileFocus(e.target.value)}>
                      {focusChoices.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Work mode</span>
                    <select value={profileMode} onChange={e => setProfileMode(e.target.value)}>
                      {modeChoices.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>

                </div>
              </details>
              <div className="profile-editor-actions">
                <button type="button" className="secondary cta-animated" disabled={profileSaving || !profileName.trim()} onClick={() => void saveProfile()}>
                  {profileSaving ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="text-link" onClick={() => {
                  setProfileName(profileNameValue); setProfileRole(profile.role || '');
                  setProfileFocus(profile.focus || 'Open capture'); setProfileMode(profile.workMode || 'Fast capture');
                  setProfileTimezone(profileTimezoneValue); setProfileEditing(false);
                }}>Cancel</button>
              </div>
            </div>
          ) : (
            /* ── View mode ── */
            <>
              <div className="profile-avatar"><UserRound size={31} /></div>
              <span className="entry-kicker">Profile</span>
              <h2>{profileNameValue}</h2>
              {profile.role && <p className="profile-role-line">{profile.role}</p>}
              <p className="profile-email-line">{profileEmailValue || 'No email connected'}</p>
              <div className="profile-ai-chips">
                <span title="Primary focus">{profile.focus || 'Open capture'}</span>
                <span title="Work mode">{profile.workMode || 'Fast capture'}</span>
              </div>
              <button type="button" className="profile-edit-trigger cta-animated" onClick={() => setProfileEditing(true)}>Edit profile</button>
            </>
          )}
        </aside>

        <div className="account-sections">
          <section className="account-section">
            <div className="account-section-title">
              <Settings size={19} />
              <h2>Settings & integrations</h2>
            </div>
            <div className="integration-stack">
              <article
                className={
                  integrations?.google_calendar.connected
                    ? "integration-card connected"
                    : "integration-card"
                }
              >
                <div>
                  <span className="entry-kicker">Calendar</span>
                  <h3>
                    {statusLine(
                      integrations?.google_calendar.connected,
                      integrations?.google_calendar.provider_account_email,
                    )}
                  </h3>
                  <p>
                    Send confirmed deadlines and scheduled items to Google
                    Calendar.
                  </p>
                  {syncMeta(integrations?.google_calendar)}
                </div>
                <div className="integration-card-actions">
                  <button
                    className="connect-action"
                    type="button"
                    onClick={() => void connectGoogle("calendar")}
                  >
                    {integrations?.google_calendar.connected
                      ? "Reconnect"
                      : "Connect calendar"}
                  </button>
                  {integrations?.google_calendar.connected && (
                    <button
                      className="text-link"
                      disabled={syncing === "calendar"}
                      onClick={() => void syncGoogle("calendar")}
                    >
                      {syncing === "calendar" ? "Checking..." : "Sync check"}
                    </button>
                  )}
                </div>
              </article>

              <article
                className={
                  integrations?.google_gmail.connected
                    ? "integration-card connected"
                    : "integration-card"
                }
              >
                <div>
                  <span className="entry-kicker">Gmail scavenging</span>
                  <h3>
                    {statusLine(
                      integrations?.google_gmail.connected,
                      integrations?.google_gmail.provider_account_email,
                    )}
                  </h3>
                  <p>
                    Scan selected Gmail signals for deadlines, applications, and
                    reminders.
                  </p>
                  {syncMeta(integrations?.google_gmail)}
                </div>
                <div className="integration-card-actions">
                  <button
                    className="connect-action"
                    type="button"
                    onClick={() => void connectGoogle("gmail")}
                  >
                    {integrations?.google_gmail.connected
                      ? "Reconnect"
                      : "Connect Gmail"}
                  </button>
                  {integrations?.google_gmail.connected && (
                    <button
                      className="text-link"
                      disabled={syncing === "gmail"}
                      onClick={() => void syncGoogle("gmail")}
                    >
                      {syncing === "gmail" ? "Checking..." : "Sync check"}
                    </button>
                  )}
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
                <p>
                  Receive scheduled prompts and habit check-ins directly on your
                  device.
                </p>
              </div>
              <div className="integration-card-actions">
                <button
                  className={
                    pushGranted ? "connect-action connected" : "connect-action"
                  }
                  type="button"
                  disabled={pushGranted}
                  onClick={async () => {
                    if (!("Notification" in window)) {
                      setMessage(
                        "Notifications are not supported in this browser.",
                      );
                      return;
                    }
                    const permission = await Notification.requestPermission();
                    if (permission === "granted") {
                      setPushGranted(true);
                      setMessage("Notifications enabled on this device.");
                      saveEssenceTime();
                    } else {
                      setMessage("Notification permission was not granted.");
                    }
                  }}
                >
                  {pushGranted
                    ? "✓ Push notifications active"
                    : "Enable push reminders"}
                </button>
              </div>
            </div>
            {pushGranted && (
              <>
                <div className="integration-card essence-time-card">
                  <div>
                    <span className="entry-kicker">Daily essence time</span>
                    <h3>Morning focus reminder</h3>
                    <p>
                      Choose when to receive your daily focus notification. Works
                      offline once installed.
                    </p>
                  </div>
                  <div className="essence-time-picker">
                    <input
                      type="time"
                      value={essenceTime}
                      onChange={(e) => setEssenceTime(e.target.value)}
                      className="time-input"
                    />
                    <button
                      type="button"
                      className={
                        timeSaved ? "connect-action connected" : "connect-action"
                      }
                      onClick={saveEssenceTime}
                    >
                      {timeSaved ? "✓ Time saved" : "Save time"}
                    </button>
                  </div>
                </div>

                <div className="integration-card essence-time-card">
                  <div>
                    <span className="entry-kicker">Everyday app check-in</span>
                    <h3>Evening reflection reminder</h3>
                    <p>
                      Daily reminder to open Pinapeg, reflect, and organize your thoughts.
                    </p>
                  </div>
                  <div className="essence-time-picker">
                    <input
                      type="time"
                      value={checkinTime}
                      onChange={(e) => setCheckinTime(e.target.value)}
                      className="time-input"
                    />
                    <button
                      type="button"
                      className={
                        checkinSaved ? "connect-action connected" : "connect-action"
                      }
                      onClick={saveCheckinTime}
                    >
                      {checkinSaved ? "✓ Time saved" : "Save time"}
                    </button>
                  </div>
                </div>

                <div className="integration-card">
                  <div>
                    <span className="entry-kicker">Sound & alert preview</span>
                    <h3>Test notification chime</h3>
                    <p>
                      Play a test audio chime and trigger a preview notification.
                    </p>
                  </div>
                  <div className="integration-card-actions">
                    <button
                      type="button"
                      className="connect-action"
                      onClick={triggerTestNotification}
                    >
                      Play test chime & alert
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}

function SettingsPage() {
  return <AccountPage />;
}

function Empty({
  icon,
  title,
  copy,
  action,
  to,
}: {
  icon: React.ReactNode;
  title: string;
  copy: string;
  action?: string;
  to?: string;
}) {
  return (
    <div className="empty">
      {icon}
      <h2>{title}</h2>
      <p>{copy}</p>
      {action && to && (
        <Link className="secondary link-button" to={to}>
          {action} <ChevronRight size={16} />
        </Link>
      )}
    </div>
  );
}

function Reminder() {
  const nav = useNavigate();
  return (
    <section className="reminder-view">
      <p className="eyebrow">A gentle nudge</p>
      <h1>Is this still relevant?</h1>
      <p>
        Take a moment. You can finish it, set it aside for a little while, or
        keep it open.
      </p>
      <div>
        <button className="primary" onClick={() => nav("/thoughts")}>
          <Check /> Mark done
        </button>
        <button className="secondary" onClick={() => nav("/schedule")}>
          Snooze for an hour
        </button>
        <button className="text-button" onClick={() => nav("/thoughts")}>
          Keep it open
        </button>
      </div>
    </section>
  );
}

function Papers() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [working, setWorking] = useState<Record<string, string>>({});
  const [questions, setQuestions] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<
    Record<string, { answer: string; citations: string[]; used_ai: boolean }>
  >({});
  const [paperMessages, setPaperMessages] = useState<Record<string, string>>(
    {},
  );
  const load = async () => {
    const items = await api.entries("?type=research_paper").catch(() => []);
    setEntries(items);
  };
  useEffect(() => {
    void load();
  }, []);
  const markRead = async (entry: Entry) => {
    const updated = await api.updateStatus(
      entry.id,
      entry.status === "done" ? "reopen" : "complete",
    );
    setEntries((current) =>
      current.map((item) => (item.id === entry.id ? updated : item)),
    );
  };
  const enrich = async (entry: Entry) => {
    setWorking((current) => ({ ...current, [entry.id]: "enrich" }));
    setPaperMessages((current) => ({ ...current, [entry.id]: "" }));
    try {
      const result = await api.enrichPaper(entry.id);
      setEntries((current) =>
        current.map((item) => (item.id === entry.id ? result.entry : item)),
      );
      setPaperMessages((current) => ({
        ...current,
        [entry.id]: result.message,
      }));
    } catch (error) {
      setPaperMessages((current) => ({
        ...current,
        [entry.id]:
          error instanceof Error
            ? error.message
            : "Unable to enrich this paper.",
      }));
    } finally {
      setWorking((current) => ({ ...current, [entry.id]: "" }));
    }
  };
  const ask = async (entry: Entry) => {
    const question = (questions[entry.id] || "").trim();
    if (!question) return;
    setWorking((current) => ({ ...current, [entry.id]: "ask" }));
    try {
      const result = await api.askPaper(entry.id, question);
      setAnswers((current) => ({ ...current, [entry.id]: result }));
    } catch (error) {
      setAnswers((current) => ({
        ...current,
        [entry.id]: {
          answer:
            error instanceof Error
              ? error.message
              : "Unable to answer from this paper yet.",
          citations: [],
          used_ai: false,
        },
      }));
    } finally {
      setWorking((current) => ({ ...current, [entry.id]: "" }));
    }
  };

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Papers</h1>
        </div>
      </div>
      <GuidedCapturePanel
        icon={<FileText size={18} />}
        kicker="Shelf shortcut"
        title="Drop a paper here, or let Capture classify it."
        copy="Paste a DOI, arXiv link, URL or title."
        placeholder="Paste DOI, arXiv link, URL, or paper title"
        buttonLabel="Save to papers"
        buildText={(value) => `research paper: ${value}`}
        onSaved={load}
      />
      {entries.length ? (
        <div className="thought-list">
          {entries.map((entry) => {
            const authors = metaList(entry, "authors");
            const sourceUrl = metaText(entry, "url");
            // Ensure URL is absolute so it doesn't accidentally route within the app
            const safeUrl = sourceUrl.startsWith('http') ? sourceUrl
              : sourceUrl.match(/^10\./) ? `https://doi.org/${sourceUrl}` 
              : sourceUrl.includes('.') ? `https://${sourceUrl}` : '';
            const paperSummary = metaText(entry, "paper_summary");
            const bibtex = metaText(entry, "bibtex");
            const fullTextReady = Boolean(metaText(entry, "paper_full_text"));
            return (
              <article className="paper-row" key={entry.id}>
                <div>
                  <div className="paper-row-header">
                    <span className="entry-kicker">
                      {entry.status === "done" ? "Read" : `Captured ${relative(entry.created_at)}`}
                    </span>
                    <ActionMenu
                      onEdit={() => { /* handled by inline edit below */ }}
                      onDelete={() => { void api.deleteEntry(entry.id).then(() => void load()); }}
                    />
                  </div>
                  <h3>{entry.title}</h3>
                  {authors.length > 0 && <p className="paper-meta">{authors.slice(0, 5).join(', ')}</p>}
                  <p>{entry.notes || 'No abstract captured yet.'}</p>
                  {safeUrl && (
                    <a className="text-link paper-link" href={safeUrl} target="_blank" rel="noreferrer">
                      Open source <ChevronRight size={14} />
                    </a>
                  )}
                  <div className="paper-intel-status">
                    <span className={paperSummary ? "ready" : ""}>Summary</span>
                    <span className={fullTextReady ? "ready" : ""}>
                      Full text
                    </span>
                    <span className={bibtex ? "ready" : ""}>BibTeX</span>
                  </div>
                  {paperMessages[entry.id] && (
                    <p className="paper-message">{paperMessages[entry.id]}</p>
                  )}
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
                    <input
                      value={questions[entry.id] || ""}
                      onChange={(event) =>
                        setQuestions((current) => ({
                          ...current,
                          [entry.id]: event.target.value,
                        }))
                      }
                      placeholder="Ask this paper a question..."
                    />
                    <button
                      className="secondary"
                      disabled={working[entry.id] === "ask"}
                      onClick={() => void ask(entry)}
                    >
                      {working[entry.id] === "ask" ? "Reading..." : "Ask"}
                    </button>
                  </div>
                  {answers[entry.id] && (
                    <section className="paper-answer">
                      <span className="entry-kicker">
                        {answers[entry.id].used_ai
                          ? "AI answer"
                          : "Relevant excerpts"}
                      </span>
                      <p>{answers[entry.id].answer}</p>
                    </section>
                  )}
                </div>
                <div className="paper-actions">
                  <button
                    className="status-button"
                    onClick={() => void enrich(entry)}
                    disabled={working[entry.id] === "enrich"}
                  >
                    {working[entry.id] === "enrich" ? (
                      <>
                        <Sparkles size={15} /> Enriching
                      </>
                    ) : (
                      <>
                        <Sparkles size={15} /> Enrich
                      </>
                    )}
                  </button>
                  <button
                    className="status-button"
                    onClick={() => void markRead(entry)}
                  >
                    {entry.status === "done" ? (
                      <>
                        <RotateCcw size={15} /> Reopen
                      </>
                    ) : (
                      <>
                        <BookOpen size={15} /> Mark read
                      </>
                    )}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          icon={<FileText />}
          title="No papers saved."
          copy="Paste an arXiv or DOI link in Capture."
          action="Capture"
          to="/capture"
        />
      )}
    </section>
  );
}

function Scholarships() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [tasks, setTasks] = useState<Record<string, Entry[]>>({});
  const load = async () => {
    const items = await api.entries("?type=scholarship_app");
    setEntries(items);
    const childPairs = await Promise.all(
      items.map(
        async (item) =>
          [item.id, await api.children(item.id).catch(() => [])] as const,
      ),
    );
    setTasks(Object.fromEntries(childPairs));
  };
  useEffect(() => {
    void load().catch(() => setEntries([]));
  }, []);
  const plan = async (id: string) => {
    const result = await api.decompose(id);
    setTasks((current) => ({ ...current, [id]: result.tasks }));
  };
  const completeTask = async (parentId: string, task: Entry) => {
    const updated = await api.updateStatus(
      task.id,
      task.status === "done" ? "reopen" : "complete",
    );
    setTasks((current) => ({
      ...current,
      [parentId]: (current[parentId] ?? []).map((item) =>
        item.id === task.id ? updated : item,
      ),
    }));
  };
  const allTasks = Object.values(tasks).flat();
  const completeTasks = allTasks.filter(
    (task) => task.status === "done",
  ).length;
  const now = Date.now();
  const deadlineWindow = 1000 * 60 * 60 * 24 * 30;
  const urgentDeadlines = entries.filter((entry) => {
    if (!entry.scheduled_at) return false;
    const due = new Date(entry.scheduled_at).getTime();
    return due >= now && due - now <= deadlineWindow;
  }).length;

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Scholarships</h1>
        </div>
      </div>
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
          <strong>
            {completeTasks}/{allTasks.length}
          </strong>
          <p>Steps completed.</p>
        </article>
        <article className="wide">
          <span className="entry-kicker">AI edge</span>
          <h2>Profile fit · Essay vault · Deadline risk</h2>
          <p>
            Pinapeg matches opportunities to your profile, preserves essay
            angles, and keeps CV updates and referee nudges together.
          </p>
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
        copy="Skip the full capture flow and add it directly."
        placeholder="e.g. Rhodes Scholarship deadline Oct 2"
        buttonLabel="Save to scholarships"
        buildText={(value) => `scholarship application: ${value}`}
        onSaved={load}
      />
      {entries.length ? (
        <div className="thought-list">
          {entries.map((entry) => {
            const planTasks = tasks[entry.id] ?? [];
            const complete = planTasks.filter(
              (task) => task.status === "done",
            ).length;
            const progress = planTasks.length
              ? Math.round((complete / planTasks.length) * 100)
              : 0;
            return (
              <article className="thought" key={entry.id}>
                <div>
                  <span className="entry-kicker">
                    {entry.scheduled_at
                      ? `Deadline ${date(entry.scheduled_at)}`
                      : "Application"}
                  </span>
                  <h3>{entry.title}</h3>
                  <p>
                    {entry.notes || "Build a clear plan before the deadline."}
                  </p>
                  {planTasks.length > 0 && (
                    <>
                      <div className="progress-line">
                        <span style={{ width: `${progress}%` }} />
                      </div>
                      <ol className="task-plan actionable">
                        {planTasks.map((task) => (
                          <li key={task.id}>
                            <button
                              className={
                                task.status === "done"
                                  ? "task-check done"
                                  : "task-check"
                              }
                              onClick={() => void completeTask(entry.id, task)}
                              aria-label={
                                task.status === "done"
                                  ? "Reopen task"
                                  : "Complete task"
                              }
                            >
                              <Check size={13} />
                            </button>
                            <span>{task.title}</span>
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                </div>
                <button
                  className="status-button"
                  onClick={() => void plan(entry.id)}
                  disabled={planTasks.length > 0}
                >
                  {planTasks.length > 0 ? (
                    <>
                      <Check size={15} /> {progress}% ready
                    </>
                  ) : (
                    <>
                      <ListChecks size={15} /> Build plan
                    </>
                  )}
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          icon={<CircleHelp />}
          title="No scholarship plans."
          copy="Confirm a scholarship goal in Capture."
          action="Capture"
          to="/capture"
        />
      )}
    </section>
  );
}

function CvTimeline() {
  const [entries, setEntries] = useState<Entry[]>([]);
  useEffect(() => {
    api
      .cvTimeline()
      .then(setEntries)
      .catch(() => setEntries([]));
  }, []);
  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Proof of progress</p>
          <h1>CV timeline</h1>
        </div>
      </div>
      {entries.length ? (
        <div className="timeline cv-list">
          {entries.map((entry) => (
            <article className="timeline-entry" key={entry.id}>
              <time>{relative(entry.created_at)}</time>
              <div>
                <span className="entry-kicker">
                  {metaText(entry, "cv_category") || entry.type}
                </span>
                <h3>{entry.title}</h3>
                <p>{entry.notes || "Completed milestone."}</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon={<Award />}
          title="No CV entries."
          copy="Completed milestones will appear here."
          action="View scholarships"
          to="/projects"
        />
      )}
    </section>
  );
}

function WeeklyReviewPage() {
  const [timeframe, setTimeframe] = useState("week");
  const [review, setReview] = useState<WeeklyReview | null>(null);
  useEffect(() => {
    api
      .weeklyReview(timeframe)
      .then(setReview)
      .catch(() => setReview(null));
  }, [timeframe]);

  return (
    <section className="page recap">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Reflection & Signal</p>
          <h1>Weekly review</h1>
        </div>
      </div>

      <div className="segmented">
        {["week", "month", "all"].map((t) => (
          <button
            key={t}
            className={timeframe === t ? "active" : ""}
            onClick={() => setTimeframe(t)}
          >
            Past {t === "all" ? "all time" : t}
          </button>
        ))}
      </div>

      <div className="recap-hero-card">
        <Sparkles size={20} className="recap-sparkle-icon" />
        <p className="recap-narration">
          {review?.coach_narration ||
            "Your review will appear after you save a few entries."}
        </p>
      </div>

      {review ? (
        <div className="review-grid">
          <section className="review-metric-card">
            <TrendingUp size={20} className="metric-icon" />
            <div>
              <strong>{review.completed_milestones.length}</strong>
              <span>Milestones</span>
            </div>
          </section>
          <section className="review-metric-card">
            <Flame size={20} className="metric-icon" />
            <div>
              <strong>{review.slipping_habits.length}</strong>
              <span>Slipping habits</span>
            </div>
          </section>
          <section className="review-metric-card">
            <BookOpen size={20} className="metric-icon" />
            <div>
              <strong>{review.papers_read.length}</strong>
              <span>Papers read</span>
            </div>
          </section>
          <section className="review-metric-card">
            <Clock3 size={20} className="metric-icon" />
            <div>
              <strong>{review.upcoming_deadlines.length}</strong>
              <span>Deadlines</span>
            </div>
          </section>
        </div>
      ) : null}

      {review?.upcoming_deadlines.length ? (
        <section className="revisit" style={{ marginTop: 24 }}>
          <div className="page-heading" style={{ marginBottom: 12 }}>
            <div>
              <p className="eyebrow">Next pressure points</p>
              <h2>Deadlines needing attention ({review.upcoming_deadlines.length})</h2>
            </div>
          </div>
          <div className="history-list">
            {review.upcoming_deadlines.map((entry) => (
              <article key={entry.id}>
                <span>
                  {entry.scheduled_at
                    ? date(entry.scheduled_at)
                    : relative(entry.created_at)}
                </span>
                <div>
                  <span className="entry-kicker">{entry.type}</span>
                  <h3>{entry.title}</h3>
                </div>
                <Link
                  className="secondary link-button"
                  to={entry.type === "scholarship_app" ? "/projects" : "/schedule"}
                >
                  View <ChevronRight size={14} />
                </Link>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function MobileNav({ onNavigate }: { onNavigate: () => void }) {
  const items = [
    ["/capture", "Capture", Mic],
    ["/schedule", "Schedule", CalendarDays],
    ["/history", "History", History],
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

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isSignedOut = localStorage.getItem("pinapeg.signedOut") === "yes";
  const onboardingDone = !isSignedOut && localStorage.getItem("pinapeg.onboardingComplete") === "yes";
  if (!onboardingDone) {
    return <Navigate to="/welcome" replace />;
  }
  return <>{children}</>;
}

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/signin" element={<Welcome />} />
        <Route path="/signup" element={<Welcome />} />
        <Route path="/capture" element={<RequireAuth><Capture /></RequireAuth>} />
        <Route path="/schedule" element={<RequireAuth><Schedule /></RequireAuth>} />
        <Route path="/thoughts" element={<RequireAuth><Thoughts /></RequireAuth>} />
        <Route path="/habits" element={<RequireAuth><Habits /></RequireAuth>} />
        <Route path="/papers" element={<RequireAuth><Papers /></RequireAuth>} />
        <Route path="/projects" element={<RequireAuth><Scholarships /></RequireAuth>} />
        <Route path="/cv-timeline" element={<RequireAuth><CvTimeline /></RequireAuth>} />
        <Route path="/history" element={<RequireAuth><HistoryPage /></RequireAuth>} />
        <Route path="/weekly-review" element={<RequireAuth><WeeklyReviewPage /></RequireAuth>} />
        <Route path="/recap" element={<RequireAuth><WeeklyReviewPage /></RequireAuth>} />
        <Route path="/reminders/:id" element={<RequireAuth><Reminder /></RequireAuth>} />
        <Route path="/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
        <Route path="*" element={<Welcome />} />
      </Routes>
    </Layout>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
