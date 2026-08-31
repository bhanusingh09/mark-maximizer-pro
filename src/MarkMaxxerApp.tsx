'use client';

import { ChangeEvent, CSSProperties, DragEvent, FormEvent, KeyboardEvent as ReactKeyboardEvent, RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Bell, Check, ChevronRight, CircleAlert, CircleCheck, CircleHelp, Eye, EyeOff, FileText, Home, Info, LayoutList, LogOut, Plus, Search, ShieldCheck, Sparkles, Upload, X } from 'lucide-react';
import type { AuthUser, MarkRecord, ProcessingRun } from './types';
import {
  extractLocalMarksheet,
  enterDemoLocal,
  getLocalUser,
  loadLocalRuns,
  saveLocalRuns,
  signInLocal,
  signOutLocal,
  signUpLocal,
} from './localData';

type View = 'overview' | 'upload' | 'records' | 'reports';
type Toast = { tone: 'success' | 'error' | 'info'; message: string } | null;
type TourRect = { top: number; left: number; width: number; height: number };
type TourStep = {
  view: View;
  target?: string;
  eyebrow: string;
  title: string;
  description: string;
  useCase: string;
};

const TOUR_STORAGE_KEY = 'markmaxxer-product-tour-seen-v1';
const tourStorageKey = (userId: string) => `${TOUR_STORAGE_KEY}:${userId}`;
const SUPPORTED_FILE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'text/csv', 'application/vnd.ms-excel']);
const SUPPORTED_FILE_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.csv'];

function isSupportedMarksheet(file: File) {
  const lowerName = file.name.toLowerCase();
  return SUPPORTED_FILE_TYPES.has(file.type.toLowerCase()) || SUPPORTED_FILE_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

const tourSteps: TourStep[] = [
  {
    view: 'overview',
    eyebrow: 'Welcome to MarkMaxxer',
    title: 'From marksheet to approved records',
    description: 'This short tour follows the complete faculty workflow and explains where each part helps you.',
    useCase: 'Use MarkMaxxer to extract marks, review uncertain entries, approve clean records, and export the result.',
  },
  {
    view: 'overview',
    target: 'primary-navigation',
    eyebrow: 'Your workspace',
    title: 'Move between each stage',
    description: 'The navigation keeps the main workflow within reach: overview, new extraction, saved records, and reports.',
    useCase: 'Jump directly to the task you need without losing the marks currently under review.',
  },
  {
    view: 'overview',
    target: 'overview-start',
    eyebrow: 'At a glance',
    title: 'Start with the faculty dashboard',
    description: 'The overview summarizes how MarkMaxxer turns uploaded marksheets into verified academic records.',
    useCase: 'Begin a new extraction or quickly understand the status of the semester workflow.',
  },
  {
    view: 'overview',
    target: 'upload-action',
    eyebrow: 'New extraction',
    title: 'Upload from anywhere',
    description: 'This action is always available, so a PDF, CSV, scan, or phone photo can enter the workflow immediately.',
    useCase: 'Use it whenever a new internal examination marksheet is ready for processing.',
  },
  {
    view: 'upload',
    target: 'upload-workspace',
    eyebrow: 'Extract and verify',
    title: 'Add context, then let validation help',
    description: 'Choose the source file, enter the subject and examination details, then extract the marks. Any uncertain or invalid record is flagged for faculty review.',
    useCase: 'Correct low-confidence handwriting, duplicate roll numbers, missing values, or marks outside the allowed range before approval.',
  },
  {
    view: 'records',
    target: 'records-library',
    eyebrow: 'Source of truth',
    title: 'Track every marksheet',
    description: 'The records library keeps each processing run, review state, and completion percentage traceable.',
    useCase: 'Return to work that needs review, confirm approved sheets, or export the current verified CSV.',
  },
  {
    view: 'reports',
    target: 'reports-overview',
    eyebrow: 'Quality insights',
    title: 'See accuracy and workload trends',
    description: 'Reports summarize processed records, verification rate, faculty review load, and estimated time saved.',
    useCase: 'Spot subjects or scan conditions that need attention before the next examination cycle.',
  },
  {
    view: 'reports',
    target: 'tour-help',
    eyebrow: 'Available anytime',
    title: 'Replay this tour whenever you like',
    description: 'The Tour button stays in the header for every signed-in faculty member, including returning users.',
    useCase: 'Use it as a quick refresher or when introducing MarkMaxxer to another faculty member.',
  },
];

const sampleRuns: ProcessingRun[] = [
  { id: 'sample-1', filename: 'cse-a-dsa-ia2.pdf', course: 'Data Structures', section: 'CSE-A', exam: 'IA-2', status: 'review', totalRecords: 42, verifiedRecords: 38, flaggedRecords: 4, createdAt: new Date(Date.now() - 36e5).toISOString() },
  { id: 'sample-2', filename: 'cse-b-dbms-ia2.jpg', course: 'Database Systems', section: 'CSE-B', exam: 'IA-2', status: 'approved', totalRecords: 39, verifiedRecords: 39, flaggedRecords: 0, createdAt: new Date(Date.now() - 2 * 36e5).toISOString() },
  { id: 'sample-3', filename: 'cse-a-os-ia1.jpg', course: 'Operating Systems', section: 'CSE-A', exam: 'IA-1', status: 'processing', totalRecords: 41, verifiedRecords: 0, flaggedRecords: 0, createdAt: new Date(Date.now() - 5 * 36e5).toISOString() },
];

const navItems: Array<{ id: View; icon: string; label: string }> = [
  { id: 'overview', icon: 'home', label: 'Overview' },
  { id: 'upload', icon: 'upload', label: 'New extraction' },
  { id: 'records', icon: 'records', label: 'Records' },
  { id: 'reports', icon: 'reports', label: 'Reports' },
];

function NavIcon({ name }: { name: string }) {
  if (name === 'home') return <Home size={19} strokeWidth={1.8} />;
  if (name === 'upload') return <Upload size={19} strokeWidth={1.8} />;
  if (name === 'records') return <LayoutList size={19} strokeWidth={1.8} />;
  return <Info size={19} strokeWidth={1.8} />;
}

const formatAgo = (iso: string) => {
  const hours = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 36e5));
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
};

function validateRows(rows: MarkRecord[]) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const roll = row.rollNumber.trim();
    if (roll) counts.set(roll, (counts.get(roll) ?? 0) + 1);
  });
  return rows.map((row) => {
    let issue: string | null = null;
    if (!row.rollNumber.trim()) issue = 'Missing roll number';
    else if ((counts.get(row.rollNumber.trim()) ?? 0) > 1) issue = 'Duplicate roll number';
    else if (row.score === null) issue = 'Missing mark';
    else if (row.score < 0 || row.score > row.maxScore) issue = `Out of range (0–${row.maxScore})`;
    else if (row.confidence < 0.85) issue = 'Low OCR confidence';
    return { ...row, issue, status: issue ? 'flagged' as const : row.status === 'approved' ? 'approved' as const : 'verified' as const };
  });
}

export default function MarkMaxxerApp() {
  const [authUser, setAuthUser] = useState<AuthUser | null | undefined>(undefined);
  const [view, setView] = useState<View>('overview');
  const [runs, setRuns] = useState<ProcessingRun[]>(sampleRuns);
  const [file, setFile] = useState<File | null>(null);
  const [course, setCourse] = useState('Data Structures');
  const [section, setSection] = useState('CSE-A');
  const [exam, setExam] = useState('Internal Assessment 2');
  const [maxScore, setMaxScore] = useState(20);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeRun, setActiveRun] = useState<ProcessingRun | null>(null);
  const [rows, setRows] = useState<MarkRecord[]>([]);
  const [filter, setFilter] = useState<'all' | 'flagged' | 'verified'>('all');
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<Toast>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  const [tourIndex, setTourIndex] = useState(0);
  const [tourOriginView, setTourOriginView] = useState<View>('overview');
  const [tourRect, setTourRect] = useState<TourRect | null>(null);
  const tourDialogRef = useRef<HTMLDivElement>(null);
  const tourInitializedFor = useRef<string | null>(null);
  const activeTourStep = (tourSteps[tourIndex] ?? tourSteps[0]) as TourStep;

  useEffect(() => {
    setAuthUser(getLocalUser());
  }, []);

  useEffect(() => {
    if (!authUser) return;
    setRuns(loadLocalRuns(sampleRuns));
  }, [authUser]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!authUser || tourInitializedFor.current === authUser.id) return;
    tourInitializedFor.current = authUser.id;
    let hasSeenTour = false;
    try {
      hasSeenTour = window.localStorage.getItem(tourStorageKey(authUser.id)) === 'seen';
    } catch {
      // The tour can still run if browser storage is unavailable.
    }
    if (!hasSeenTour) {
      setTourOriginView(view);
      setTourIndex(0);
      setTourActive(true);
    }
  }, [authUser, view]);

  useEffect(() => {
    if (!tourActive) return;
    let measurementTimer = 0;
    let focusTimer = 0;

    const updateTarget = () => {
      const target = activeTourStep.target
        ? document.querySelector<HTMLElement>(`[data-tour="${activeTourStep.target}"]`)
        : null;
      if (!target) {
        setTourRect(null);
        return;
      }
      const bounds = target.getBoundingClientRect();
      const padding = 8;
      const top = Math.max(8, bounds.top - padding);
      const left = Math.max(8, bounds.left - padding);
      setTourRect({
        top,
        left,
        width: Math.max(1, Math.min(bounds.width + padding * 2, window.innerWidth - left - 8)),
        height: Math.max(1, Math.min(bounds.height + padding * 2, window.innerHeight - top - 8)),
      });
    };

    const revealTarget = () => {
      const target = activeTourStep.target
        ? document.querySelector<HTMLElement>(`[data-tour="${activeTourStep.target}"]`)
        : null;
      target?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      updateTarget();
      measurementTimer = window.setTimeout(updateTarget, 320);
      focusTimer = window.setTimeout(() => tourDialogRef.current?.focus(), 80);
    };

    const startTimer = window.setTimeout(revealTarget, 90);
    window.addEventListener('resize', updateTarget);
    window.addEventListener('scroll', updateTarget, true);
    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(measurementTimer);
      window.clearTimeout(focusTimer);
      window.removeEventListener('resize', updateTarget);
      window.removeEventListener('scroll', updateTarget, true);
    };
  }, [activeTourStep.target, tourActive, tourIndex, view]);

  const flaggedCount = rows.filter((row) => row.status === 'flagged').length;
  const verifiedCount = rows.length - flaggedCount;
  const filteredRows = rows.filter((row) => {
    const matchesFilter = filter === 'all' || (filter === 'flagged' ? row.status === 'flagged' : row.status !== 'flagged');
    const normalized = query.toLowerCase();
    return matchesFilter && (!normalized || row.rollNumber.toLowerCase().includes(normalized) || row.studentName.toLowerCase().includes(normalized));
  });

  const totals = useMemo(() => {
    const total = runs.reduce((sum, run) => sum + run.totalRecords, 0);
    const flagged = runs.reduce((sum, run) => sum + run.flaggedRecords, 0);
    const verified = runs.reduce((sum, run) => sum + run.verifiedRecords, 0);
    return { total, flagged, verified, rate: total ? Math.round((verified / total) * 1000) / 10 : 0 };
  }, [runs]);

  if (authUser === undefined) return <AuthLoading />;
  if (authUser === null) return <EmailAuthScreen onAuthenticated={setAuthUser} />;

  const displayName = authUser.name.split(' ')[0] || 'Faculty';
  const initials = authUser.name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'FM';

  const logout = async () => {
    signOutLocal();
    setProfileOpen(false);
    setRows([]);
    setActiveRun(null);
    setRuns(sampleRuns);
    setAuthUser(null);
  };

  const selectFile = (chosen?: File) => {
    if (!chosen) return;
    if (chosen.size > 10 * 1024 * 1024) return setToast({ tone: 'error', message: 'That file is larger than 10 MB.' });
    if (!isSupportedMarksheet(chosen)) return setToast({ tone: 'error', message: 'Please choose a PDF, PNG, JPG, or CSV file.' });
    setFile(chosen);
    setRows([]);
    setActiveRun(null);
  };

  const startUpload = () => {
    setView('upload');
    window.setTimeout(() => document.querySelector('.upload-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 40);
  };

  const startTour = () => {
    setTourOriginView(view);
    setTourIndex(0);
    setTourRect(null);
    setProfileOpen(false);
    setView((tourSteps[0] as TourStep).view);
    setTourActive(true);
  };

  const rememberTour = () => {
    try {
      window.localStorage.setItem(tourStorageKey(authUser.id), 'seen');
    } catch {
      // Replay remains available even if browser storage is unavailable.
    }
  };

  const closeTour = (completed: boolean) => {
    rememberTour();
    setTourActive(false);
    setTourRect(null);
    setView(tourOriginView);
    if (completed) setToast({ tone: 'success', message: 'Tour complete. Use the Tour button anytime for a refresher.' });
  };

  const nextTourStep = () => {
    if (tourIndex === tourSteps.length - 1) closeTour(true);
    else {
      const nextIndex = tourIndex + 1;
      setTourIndex(nextIndex);
      setView(((tourSteps[nextIndex] ?? tourSteps[0]) as TourStep).view);
    }
  };

  const previousTourStep = () => {
    const previousIndex = Math.max(0, tourIndex - 1);
    setTourIndex(previousIndex);
    setView(((tourSteps[previousIndex] ?? tourSteps[0]) as TourStep).view);
  };

  const extractMarks = async () => {
    if (!file) return setToast({ tone: 'error', message: 'Choose a marksheet first.' });
    setProcessing(true);
    setProgress(12);
    const timer = window.setInterval(() => setProgress((value) => Math.min(value + Math.ceil(Math.random() * 12), 88)), 350);
    try {
      const payload = await extractLocalMarksheet(file, course, section, exam, maxScore);
      setProgress(100);
      setRows(payload.rows ?? []);
      setActiveRun(payload);
      const nextRuns = [payload, ...runs.filter((run) => run.id !== payload.id)];
      setRuns(nextRuns);
      saveLocalRuns(nextRuns);
      setToast({ tone: 'success', message: `${payload.totalRecords} records extracted. ${payload.flaggedRecords} need review.` });
    } catch (error) {
      setToast({ tone: 'error', message: error instanceof Error ? error.message : 'Could not process this file.' });
    } finally {
      window.clearInterval(timer);
      window.setTimeout(() => setProcessing(false), 450);
    }
  };

  const updateRow = (id: string, field: 'rollNumber' | 'studentName' | 'score', value: string) => {
    setRows((current) => validateRows(current.map((row) => row.id === id ? {
      ...row,
      [field]: field === 'score' ? (value === '' ? null : Number(value)) : value,
      confidence: field === 'score' ? 1 : row.confidence,
    } : row)));
  };

  const approveClean = () => {
    setRows((current) => current.map((row) => row.status === 'verified' ? { ...row, status: 'approved' } : row));
    setToast({ tone: 'success', message: `${verifiedCount} clean records approved.` });
  };

  const saveRun = async (finalize = false) => {
    if (!activeRun) return;
    if (finalize && flaggedCount) return setToast({ tone: 'error', message: `Resolve ${flaggedCount} flagged ${flaggedCount === 1 ? 'record' : 'records'} before final approval.` });
    try {
      const status: ProcessingRun['status'] = finalize ? 'approved' : 'review';
      const savedRows = finalize ? rows.map((row) => ({ ...row, status: 'approved' as const })) : rows;
      const savedRun: ProcessingRun & { rows: MarkRecord[] } = {
        ...activeRun,
        status,
        verifiedRecords: rows.length - flaggedCount,
        flaggedRecords: flaggedCount,
        rows: savedRows,
      };
      setRows(savedRows);
      setActiveRun(savedRun);
      const nextRuns = runs.map((run) => run.id === activeRun.id ? savedRun : run);
      setRuns(nextRuns);
      saveLocalRuns(nextRuns);
      setToast({ tone: 'success', message: finalize ? 'Marks approved and securely stored.' : 'Review progress saved.' });
    } catch (error) {
      setToast({ tone: 'error', message: error instanceof Error ? error.message : 'Could not save changes.' });
    }
  };

  const exportCsv = () => {
    if (!rows.length) return setToast({ tone: 'info', message: 'Process a marksheet before exporting.' });
    const quote = (value: string | number | null) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = ['Roll number,Student name,Marks,Maximum,Status', ...rows.map((row) => [row.rollNumber, row.studentName, row.score, row.maxScore, row.status].map(quote).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${course.replaceAll(' ', '-').toLowerCase()}-${section.toLowerCase()}-marks.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setToast({ tone: 'success', message: 'Verified marks exported as CSV.' });
  };

  return (
    <main className="app-shell">
       <aside className="sidebar">
         <button className="brand-mark" onClick={() => setView('overview')} aria-label="MarkMaxxer home" data-testid="button-home">M</button>
        <nav aria-label="Primary navigation" className="side-nav" data-tour="primary-navigation">
           {navItems.map((item) => <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => setView(item.id)} aria-label={item.label} aria-current={view === item.id ? 'page' : undefined} title={item.label} data-testid={`button-nav-${item.id}`}><NavIcon name={item.icon} /></button>)}
        </nav>
        <div className="profile-wrap">
           <button className="avatar" aria-label="Faculty profile" onClick={() => setProfileOpen((open) => !open)} data-testid="button-profile">{initials}</button>
           {profileOpen && <div className="profile-card"><strong>{authUser.name}</strong><span>{authUser.email}</span><small>Secure faculty session</small><button className="profile-logout" onClick={logout} data-testid="button-sign-out"><LogOut size={13} /> Sign out</button></div>}
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
           <div><div className="eyebrow">Faculty workspace · 2026–27</div><h1>{view === 'overview' ? `Good morning, Prof. ${displayName}` : view === 'upload' ? (rows.length ? 'Verify extracted marks' : 'New marks extraction') : view === 'records' ? 'Marksheets & records' : 'Verification insights'}</h1></div>
           <div className="top-actions"><button className="tour-help-button" data-tour="tour-help" onClick={startTour} aria-label="Start website tour" title="Take the MarkMaxxer tour" data-testid="button-tour"><span aria-hidden="true"><CircleHelp size={15} /></span><strong>Tour</strong></button><button className="icon-button" aria-label="Notifications" title="Notifications" onClick={() => setToast({ tone: 'info', message: `${totals.flagged} entries are waiting for review.` })} data-testid="button-notifications"><Bell size={16} /><span className="notification-dot" /></button><button className="primary-button" data-tour="upload-action" onClick={startUpload} data-testid="button-upload"><Plus size={16} /> Upload marksheet</button></div>
        </header>

        {view === 'overview' && <Overview runs={runs} totals={totals} startUpload={startUpload} openRecords={() => setView('records')} />}
        {view === 'upload' && <UploadWorkspace file={file} setFile={selectFile} course={course} setCourse={setCourse} section={section} setSection={setSection} exam={exam} setExam={setExam} maxScore={maxScore} setMaxScore={setMaxScore} extracting={processing} progress={progress} extractMarks={extractMarks} activeRun={activeRun} rows={rows} filteredRows={filteredRows} flaggedCount={flaggedCount} verifiedCount={verifiedCount} filter={filter} setFilter={setFilter} query={query} setQuery={setQuery} updateRow={updateRow} approveClean={approveClean} saveRun={saveRun} exportCsv={exportCsv} />}
        {view === 'records' && <RecordsView runs={runs} exportCsv={exportCsv} hasActiveRun={Boolean(activeRun)} startUpload={startUpload} />}
        {view === 'reports' && <ReportsView runs={runs} totals={totals} />}
      </section>

       {toast && <div className={`toast ${toast.tone}`} role="status"><span>{toast.tone === 'success' ? <Check size={15} /> : toast.tone === 'error' ? <CircleAlert size={15} /> : <Info size={15} />}</span>{toast.message}<button onClick={() => setToast(null)} aria-label="Dismiss" data-testid="button-dismiss-toast"><X size={16} /></button></div>}
      {tourActive && <ProductTour dialogRef={tourDialogRef} index={tourIndex} step={activeTourStep} targetRect={tourRect} onBack={previousTourStep} onNext={nextTourStep} onSkip={() => closeTour(false)} />}
    </main>
  );
}

function ProductTour({ dialogRef, index, step, targetRect, onBack, onNext, onSkip }: { dialogRef: RefObject<HTMLDivElement | null>; index: number; step: TourStep; targetRect: TourRect | null; onBack: () => void; onNext: () => void; onSkip: () => void }) {
  const dialogStyle: CSSProperties = targetRect
    ? {
        ...(targetRect.top < 300 ? { bottom: 24 } : { top: 24 }),
        ...(targetRect.left < 400 ? { right: 24 } : { left: 24 }),
      }
    : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onSkip();
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      onNext();
      return;
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      onBack();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return <>
    <div className="tour-overlay" aria-hidden="true">
      {targetRect ? <div className="tour-spotlight" style={targetRect} /> : <div className="tour-backdrop" />}
    </div>
    <div ref={dialogRef} className="tour-dialog" style={dialogStyle} role="dialog" aria-modal="true" aria-live="polite" aria-labelledby="tour-title" aria-describedby="tour-description tour-use-case" tabIndex={-1} onKeyDown={handleKeyDown}>
      <div className="tour-progress" aria-label={`Step ${index + 1} of ${tourSteps.length}`}>
        <span>{step.eyebrow}</span>
        <strong>{String(index + 1).padStart(2, '0')} / {String(tourSteps.length).padStart(2, '0')}</strong>
      </div>
      <div className="tour-progress-track" aria-hidden="true"><span style={{ width: `${((index + 1) / tourSteps.length) * 100}%` }} /></div>
      <h2 id="tour-title">{step.title}</h2>
      <p id="tour-description">{step.description}</p>
       <div className="tour-use-case" id="tour-use-case"><span aria-hidden="true"><Sparkles size={15} /></span><p><strong>When to use it</strong>{step.useCase}</p></div>
      <div className="tour-actions">
         <button className="tour-skip" onClick={onSkip} data-testid="button-skip-tour">Skip tour</button>
        <div>
           <button className="tour-back" onClick={onBack} disabled={index === 0} data-testid="button-tour-back">Back</button>
           <button className="tour-next" onClick={onNext} data-testid="button-tour-next">{index === tourSteps.length - 1 ? 'Finish' : 'Next'} <ChevronRight size={15} /></button>
        </div>
      </div>
      <small className="tour-keyboard-hint">Use left and right keys to move · Esc to close</small>
    </div>
  </>;
}

function AuthLoading() {
  return <main className="auth-loading"><div className="auth-brand"><span>M</span><strong>MarkMaxxer</strong></div><div className="auth-loading-card" aria-label="Preparing your private workspace"><div className="loading-line wide" /><div className="loading-line medium" /><div className="loading-line short" /></div><p>Preparing your private workspace</p></main>;
}

function EmailAuthScreen({ onAuthenticated }: { onAuthenticated: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const user = mode === 'signin'
        ? signInLocal(email, password)
        : signUpLocal(name, email, password);
      onAuthenticated(user);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to continue.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (nextMode: 'signin' | 'signup') => {
    setMode(nextMode);
    setError('');
    setPassword('');
  };

  return <main className="auth-shell">
    <section className="auth-story">
      <div className="auth-brand inverse"><span>M</span><strong>MarkMaxxer</strong></div>
       <div className="auth-story-copy"><span className="auth-kicker">AI-assisted assessment workflow</span><h1>Accurate marks.<br />Less manual work.</h1><p>Extract, verify, approve, and export internal examination marks from one secure faculty workspace.</p></div>
       <div className="auth-proof"><div className="mini-sheet" aria-hidden="true"><div><span>21CS041</span><b>18</b><i><Check size={10} /></i></div><div><span>21CS042</span><b>16</b><i><Check size={10} /></i></div><div><span>21CS043</span><b>24</b><i><CircleAlert size={10} /></i></div></div><span className="auth-confidence">98.4% confidence</span></div>
      <div className="auth-story-footer"><span>Encrypted document storage</span><span>Faculty-controlled approval</span></div>
    </section>

    <section className="auth-form-side">
      <div className="auth-mobile-brand"><div className="auth-brand"><span>M</span><strong>MarkMaxxer</strong></div></div>
      <div className="auth-card">
        <span className="eyebrow">Faculty access</span>
        <h2>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h2>
        <p>{mode === 'signin' ? 'Sign in with your registered email to continue.' : 'Set up your secure faculty workspace in a moment.'}</p>
         <div className="auth-tabs" role="tablist"><button role="tab" aria-selected={mode === 'signin'} className={mode === 'signin' ? 'active' : ''} onClick={() => switchMode('signin')} data-testid="button-auth-signin">Sign in</button><button role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => switchMode('signup')} data-testid="button-auth-signup">Create account</button></div>
        <form onSubmit={submit} className="auth-form">
           {mode === 'signup' && <label>Full name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="Prof. Ananya Krishnan" minLength={2} maxLength={80} required data-testid="input-full-name" /></label>}
           <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="faculty@college.edu" maxLength={254} required data-testid="input-email" /></label>
           <label>Password<div className="password-field"><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} placeholder="Minimum 8 characters" minLength={8} maxLength={128} required data-testid="input-password" /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} data-testid="button-toggle-password">{showPassword ? <EyeOff size={14} /> : <Eye size={14} />}</button></div></label>
           {error && <div className="auth-error" role="alert"><span><CircleAlert size={14} /></span>{error}</div>}
           <button className="auth-submit" disabled={loading} data-testid="button-submit-auth">{loading ? 'Please wait…' : mode === 'signin' ? 'Sign in securely' : 'Create secure account'}<ArrowRight size={17} /></button>
        </form>
         <div className="demo-entry"><span>Just looking around?</span><button type="button" onClick={() => onAuthenticated(enterDemoLocal())} data-testid="button-demo-entry">Enter demo workspace <ArrowRight size={13} /></button></div>
        <p className="auth-legal">By continuing, you agree to use MarkMaxxer only for authorized academic records. Password recovery and email verification can be added with a mail provider later.</p>
      </div>
    </section>
  </main>;
}

function Overview({ runs, totals, startUpload, openRecords }: { runs: ProcessingRun[]; totals: { total: number; verified: number; flagged: number; rate: number }; startUpload: () => void; openRecords: () => void }) {
  const attention = runs.reduce((sum, run) => sum + run.flaggedRecords, 0);
  return <div className="dashboard-grid">
     <section className="hero-card" data-tour="overview-start"><div className="hero-copy"><span className="ai-pill"><Sparkles size={12} /> AI-assisted verification</span><h2>Turn marksheets into verified records—in minutes.</h2><p>Upload a scanned sheet. MarkMaxxer extracts every mark, validates each record, and puts only uncertain entries in front of you.</p><button className="dark-button" onClick={startUpload} data-testid="button-start-extraction">Start new extraction <ArrowRight size={17} /></button></div><div className="scan-visual" aria-hidden="true"><div className="paper-sheet"><div className="paper-head"><span /><span /></div>{[18, 16, 19, 14].map((mark, index) => <div className="paper-row" key={mark}><span className="row-number">{index + 1}</span><span className="row-line" /><strong>{mark}</strong><i><Check size={9} /></i></div>)}</div><span className="scan-line" /><span className="confidence-tag">98.4% confidence</span></div></section>
    <section className="summary-card"><div className="section-heading"><div><span className="eyebrow">This semester</span><h3>Processing summary</h3></div><button className="plain-button" onClick={openRecords}>View records</button></div><div className="stat-row"><div className="stat"><strong>{totals.total}</strong><span>Records processed</span><small className="positive">↑ 18% this week</small></div><div className="stat"><strong>{totals.rate}%</strong><span>Auto-verified</span><small>{totals.verified} clean entries</small></div><div className="stat"><strong>{attention}</strong><span>Need attention</span><small className="warning">Review suggested</small></div></div></section>
     <section className="recent-card"><div className="section-heading"><div><span className="eyebrow">Latest activity</span><h3>Recent marksheets</h3></div><button className="plain-button" onClick={openRecords} data-testid="button-see-all-records">See all</button></div><div className="sheet-list">{runs.slice(0, 3).map((run) => <article className="sheet-row" key={run.id}><div className="file-icon"><FileText size={16} /></div><div className="sheet-copy"><strong>{run.section} · {run.course}</strong><span>{run.totalRecords} records · {run.exam} · {formatAgo(run.createdAt)}</span></div><span className={`status ${run.status === 'approved' ? 'green' : run.status === 'processing' ? 'blue' : 'amber'}`}>{run.status === 'approved' ? 'Verified' : run.status === 'processing' ? 'Processing' : 'Needs review'}</span><button className="row-action" onClick={openRecords} aria-label={`Open ${run.course}`} data-testid={`button-open-run-${run.id}`}><ChevronRight size={15} /></button></article>)}</div></section>
     <aside className="attention-card"><div className="section-heading"><div><span className="eyebrow">Review queue</span><h3>Needs attention</h3></div><span className="count-badge">{attention}</span></div><div className="progress-ring" style={{ background: `conic-gradient(var(--green) 0 ${totals.rate}%, #e9eeeb ${totals.rate}% 100%)` }}><div><strong>{totals.rate}%</strong><span>verified</span></div></div><div className="issue-list"><div><span className="issue-dot red" /><p><strong>Out-of-range marks</strong><small>Values exceed exam maximum</small></p></div><div><span className="issue-dot amber" /><p><strong>Low-confidence entries</strong><small>Manual check suggested</small></p></div><div><span className="issue-dot blue" /><p><strong>Missing identifiers</strong><small>Student match required</small></p></div></div><button className="review-button" onClick={openRecords} data-testid="button-review-flagged">Review flagged records <span>{attention}</span><ChevronRight size={14} /></button></aside>
  </div>;
}

type UploadProps = {
  file: File | null; setFile: (file?: File) => void;
  course: string; setCourse: (value: string) => void; section: string; setSection: (value: string) => void;
  exam: string; setExam: (value: string) => void; maxScore: number; setMaxScore: (value: number) => void;
  extracting: boolean; progress: number; extractMarks: () => void; activeRun: ProcessingRun | null; rows: MarkRecord[];
  filteredRows: MarkRecord[]; flaggedCount: number; verifiedCount: number; filter: 'all' | 'flagged' | 'verified'; setFilter: (value: 'all' | 'flagged' | 'verified') => void;
  query: string; setQuery: (value: string) => void; updateRow: (id: string, field: 'rollNumber' | 'studentName' | 'score', value: string) => void;
  approveClean: () => void; saveRun: (finalize?: boolean) => void; exportCsv: () => void;
};

function UploadWorkspace(props: UploadProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const drop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); props.setFile(event.dataTransfer.files[0]); };
   return <div className="workflow-shell" data-tour="upload-workspace"><div className="workflow-top"><div className="stepper"><span className="done"><b>1</b> Upload</span><i /><span className={props.rows.length ? 'done' : 'current'}><b>2</b> Verify</span><i /><span className={props.activeRun?.status === 'approved' ? 'done' : ''}><b>3</b> Approve</span></div>{props.rows.length > 0 && <div className="workflow-actions"><button className="secondary-button" onClick={() => props.saveRun(false)} data-testid="button-save-draft">Save draft</button><button className="primary-button" onClick={() => props.saveRun(true)} data-testid="button-approve-finalize">Approve & finalize</button></div>}</div>
     {!props.rows.length ? <section className="upload-panel"><div className="upload-copy"><span className="eyebrow">Step 1 · Source document</span><h2>Upload a marksheet</h2><p>MarkMaxxer accepts clear scans, phone photos, PDFs, and CSV exports. Student data stays inside your secure faculty workspace.</p><div className="trust-row"><span><ShieldCheck size={13} /> Encrypted storage</span><span><CircleCheck size={13} /> Automated validation</span><span><Check size={13} /> Faculty approval required</span></div></div><div className={`drop-zone ${props.file ? 'has-file' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={drop} onClick={() => fileInput.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') fileInput.current?.click(); }} data-testid="dropzone-marksheet"><input ref={fileInput} type="file" accept=".pdf,.png,.jpg,.jpeg,.csv,application/pdf,image/png,image/jpeg,text/csv" onChange={(event: ChangeEvent<HTMLInputElement>) => props.setFile(event.target.files?.[0])} />{props.file ? <><div className="selected-file-icon"><FileText size={25} /></div><strong>{props.file.name}</strong><span>{(props.file.size / 1024).toFixed(0)} KB · Ready to process</span><button className="plain-button" onClick={(event) => { event.stopPropagation(); fileInput.current?.click(); }} data-testid="button-replace-file">Replace file</button></> : <><div className="upload-icon"><Upload size={25} /></div><strong>Drop your marksheet here</strong><span>or click to browse · PDF, PNG, JPG, CSV · Max 10 MB</span><button className="secondary-button" type="button" data-testid="button-choose-file">Choose file</button></>}</div><div className="metadata-grid"><label>Course / subject<input value={props.course} onChange={(event) => props.setCourse(event.target.value)} placeholder="e.g. Data Structures" data-testid="input-course" /></label><label>Class / section<input value={props.section} onChange={(event) => props.setSection(event.target.value)} placeholder="e.g. CSE-A" data-testid="input-section" /></label><label>Examination<select value={props.exam} onChange={(event) => props.setExam(event.target.value)} data-testid="select-examination"><option>Internal Assessment 1</option><option>Internal Assessment 2</option><option>Internal Assessment 3</option><option>Model Examination</option></select></label><label>Maximum marks<input type="number" min="1" max="500" value={props.maxScore} onChange={(event) => props.setMaxScore(Math.max(1, Number(event.target.value)))} data-testid="input-max-score" /></label></div><div className="upload-footer"><p><span>CSV format:</span> Include Roll number, Student name, and Marks columns. Image/PDF extraction uses the demo adapter.</p><button className="dark-button extract-button" disabled={!props.file || props.extracting} onClick={props.extractMarks} data-testid="button-extract">{props.extracting ? `Reading marksheet… ${props.progress}%` : 'Extract & validate marks'} <ArrowRight size={17} /></button></div>{props.extracting && <div className="processing-bar"><span style={{ width: `${props.progress}%` }} /></div>}</section> : <VerificationTable {...props} />}</div>;
}

function VerificationTable(props: UploadProps) {
   return <section className="verification-card"><div className="verification-head"><div><span className="eyebrow">Step 2 · Faculty verification</span><h2>{props.course} · {props.section}</h2><p>{props.activeRun?.filename} · {props.exam} · maximum {props.maxScore} marks</p></div><div className="confidence-summary"><span><b>{props.rows.length}</b>Total</span><span className="good"><b>{props.verifiedCount}</b>Clean</span><span className="bad"><b>{props.flaggedCount}</b>Flagged</span></div></div><div className="table-toolbar"><div className="filter-tabs"><button className={props.filter === 'all' ? 'active' : ''} onClick={() => props.setFilter('all')} data-testid="button-filter-all">All {props.rows.length}</button><button className={props.filter === 'flagged' ? 'active' : ''} onClick={() => props.setFilter('flagged')} data-testid="button-filter-flagged">Flagged {props.flaggedCount}</button><button className={props.filter === 'verified' ? 'active' : ''} onClick={() => props.setFilter('verified')} data-testid="button-filter-clean">Clean {props.verifiedCount}</button></div><div className="table-tools"><label className="search-box"><Search size={14} /><input value={props.query} onChange={(event) => props.setQuery(event.target.value)} placeholder="Find student…" aria-label="Find student" data-testid="input-search-records" /></label><button className="secondary-button" onClick={props.exportCsv} data-testid="button-export-csv">Export CSV</button><button className="primary-button compact" onClick={props.approveClean} data-testid="button-approve-clean">Approve clean</button></div></div><div className="records-table-wrap"><table className="records-table"><thead><tr><th>#</th><th>Roll number</th><th>Student name</th><th>Extracted mark</th><th>Confidence</th><th>Validation</th></tr></thead><tbody>{props.filteredRows.map((row, index) => <tr key={row.id} className={row.status === 'flagged' ? 'flagged-row' : ''}><td>{String(index + 1).padStart(2, '0')}</td><td><input aria-label={`Roll number for ${row.studentName}`} value={row.rollNumber} onChange={(event) => props.updateRow(row.id, 'rollNumber', event.target.value)} className={!row.rollNumber ? 'invalid' : ''} data-testid={`input-roll-${row.id}`} /></td><td><input aria-label="Student name" value={row.studentName} onChange={(event) => props.updateRow(row.id, 'studentName', event.target.value)} data-testid={`input-name-${row.id}`} /></td><td><div className="mark-input"><input aria-label={`Marks for ${row.studentName}`} type="number" value={row.score ?? ''} onChange={(event) => props.updateRow(row.id, 'score', event.target.value)} className={row.issue?.includes('range') || row.issue === 'Missing mark' ? 'invalid' : ''} data-testid={`input-score-${row.id}`} /><span>/ {row.maxScore}</span></div></td><td><div className="confidence"><span><i style={{ width: `${Math.round(row.confidence * 100)}%` }} /></span><b>{Math.round(row.confidence * 100)}%</b></div></td><td>{row.issue ? <span className="validation-badge problem"><CircleAlert size={12} /> {row.issue}</span> : <span className="validation-badge okay"><Check size={12} /> {row.status === 'approved' ? 'Approved' : 'Verified'}</span>}</td></tr>)}</tbody></table></div><div className="verification-footer"><p><strong>{props.flaggedCount ? `${props.flaggedCount} entries still need attention.` : 'All entries are ready.'}</strong><span>Editing a value automatically runs validation again.</span></p><div><button className="secondary-button" onClick={() => props.saveRun(false)} data-testid="button-save-progress">Save progress</button><button className="primary-button" onClick={() => props.saveRun(true)} disabled={props.flaggedCount > 0} data-testid="button-finalize-records">Approve & finalize <ArrowRight size={14} /></button></div></div></section>;
}

function RecordsView({ runs, exportCsv, hasActiveRun, startUpload }: { runs: ProcessingRun[]; exportCsv: () => void; hasActiveRun: boolean; startUpload: () => void }) {
  const [status, setStatus] = useState<'all' | 'review' | 'approved'>('all');
  const visible = runs.filter((run) => status === 'all' || run.status === status);
   return <div className="page-stack"><section className="page-intro"><div><span className="eyebrow">Source of truth</span><h2>Marksheets & records</h2><p>Every extraction is traceable from the source document to the final approved marks.</p></div><button className="dark-button" onClick={startUpload} data-testid="button-new-extraction">New extraction <Plus size={16} /></button></section><section className="records-card" data-tour="records-library"><div className="table-toolbar"><div className="filter-tabs"><button className={status === 'all' ? 'active' : ''} onClick={() => setStatus('all')} data-testid="button-records-all">All</button><button className={status === 'review' ? 'active' : ''} onClick={() => setStatus('review')} data-testid="button-records-review">Needs review</button><button className={status === 'approved' ? 'active' : ''} onClick={() => setStatus('approved')} data-testid="button-records-approved">Approved</button></div>{hasActiveRun && <button className="secondary-button" onClick={exportCsv} data-testid="button-export-current">Export current CSV</button>}</div><div className="run-list"><div className="run-list-head"><span>Marksheet</span><span>Class</span><span>Progress</span><span>Status</span><span>Uploaded</span></div>{visible.map((run) => { const percent = run.totalRecords ? Math.round((run.verifiedRecords / run.totalRecords) * 100) : 0; return <article className="run-row" key={run.id}><div className="run-file"><div className="file-icon"><FileText size={16} /></div><p><strong>{run.course}</strong><span>{run.filename} · {run.exam}</span></p></div><strong>{run.section}</strong><div className="run-progress"><span><i style={{ width: `${percent}%` }} /></span><b>{percent}%</b></div><span className={`status ${run.status === 'approved' ? 'green' : run.status === 'processing' ? 'blue' : 'amber'}`}>{run.status === 'approved' ? 'Approved' : run.status === 'processing' ? 'Processing' : `${run.flaggedRecords} to review`}</span><span>{formatAgo(run.createdAt)}</span></article>; })}</div>{visible.length === 0 && <div className="empty-state"><FileText size={22} /><strong>No marksheets in this view</strong><span>Change the filter or start a new extraction.</span></div>}</section></div>;
}

function ReportsView({ runs, totals }: { runs: ProcessingRun[]; totals: { total: number; verified: number; flagged: number; rate: number } }) {
  const courses = [...new Set(runs.map((run) => run.course))].slice(0, 5).map((course) => { const related = runs.filter((run) => run.course === course); const total = related.reduce((sum, run) => sum + run.totalRecords, 0); const verified = related.reduce((sum, run) => sum + run.verifiedRecords, 0); return { course, total, rate: total ? Math.round((verified / total) * 100) : 0 }; });
   return <div className="page-stack"><section className="page-intro"><div><span className="eyebrow">Quality & efficiency</span><h2>Verification insights</h2><p>A clear view of extraction accuracy, faculty workload, and records ready for submission.</p></div><select className="period-select" aria-label="Reporting period" data-testid="select-reporting-period"><option>Current semester</option><option>Last 30 days</option></select></section><div className="report-stats" data-tour="reports-overview"><article><span>Processed records</span><strong>{totals.total}</strong><small>across {runs.length} marksheets</small></article><article><span>Verification rate</span><strong>{totals.rate}%</strong><small className="positive">Improving against last month</small></article><article><span>Faculty review load</span><strong>{totals.flagged}</strong><small>entries requiring attention</small></article><article><span>Estimated time saved</span><strong>{Math.round(totals.total * 0.7)}m</strong><small>at 42 seconds per record</small></article></div><section className="chart-card"><div className="section-heading"><div><span className="eyebrow">By subject</span><h3>Auto-verification performance</h3></div><span className="chart-legend"><i /> Clean extraction rate</span></div><div className="bar-chart">{courses.map((item) => <div className="bar-row" key={item.course}><span>{item.course}</span><div><i style={{ width: `${item.rate}%` }} /></div><strong>{item.rate}%</strong></div>)}</div><div className="chart-note"><span><Sparkles size={15} /></span><p><strong>Quality insight</strong><small>Clear, flat scans produce the highest confidence. Low-light phone photos account for most manual review.</small></p></div></section></div>;
}
