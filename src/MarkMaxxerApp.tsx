"use client";

import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  Bell,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Eye,
  EyeOff,
  FileText,
  Home,
  Info,
  LayoutList,
  LoaderCircle,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import {
  cloudConfigurationError,
  createRun,
  createSourceUrl,
  getAuthenticatedUser,
  listenForAuthChanges,
  loadRunRows,
  loadRuns,
  saveRun as persistRun,
  signIn,
  signOut,
  signUp,
} from "./cloud";
import { extractMarksheet } from "./documentExtraction";
import type { AuthUser, MarkRecord, ProcessingRun } from "./types";
import { validateRows } from "./validation";

type View = "overview" | "upload" | "records" | "reports";
type Toast = { tone: "success" | "error" | "info"; message: string } | null;

const TOUR_STORAGE_KEY = "markmaxxer-product-tour-seen-v2";
const SUPPORTED_FILE_TYPES = new Set(["application/pdf", "text/csv", "application/vnd.ms-excel"]);
const SUPPORTED_FILE_EXTENSIONS = [".pdf", ".csv"];

function isSupportedMarksheet(file: File) {
  const lowerName = file.name.toLowerCase();
  return (
    SUPPORTED_FILE_TYPES.has(file.type.toLowerCase()) ||
    SUPPORTED_FILE_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
  );
}

function formatAgo(iso: string) {
  const elapsed = Math.max(0, Date.now() - new Date(iso).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function academicYear() {
  const today = new Date();
  const start = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  return `${start}–${String(start + 1).slice(-2)}`;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const navItems: Array<{ id: View; icon: string; label: string }> = [
  { id: "overview", icon: "home", label: "Overview" },
  { id: "upload", icon: "upload", label: "New extraction" },
  { id: "records", icon: "records", label: "Records" },
  { id: "reports", icon: "reports", label: "Reports" },
];

function NavIcon({ name }: { name: string }) {
  if (name === "home") return <Home size={19} strokeWidth={1.8} />;
  if (name === "upload") return <Upload size={19} strokeWidth={1.8} />;
  if (name === "records") return <LayoutList size={19} strokeWidth={1.8} />;
  return <Info size={19} strokeWidth={1.8} />;
}

export default function MarkMaxxerApp() {
  const [authUser, setAuthUser] = useState<AuthUser | null | undefined>(undefined);
  const [view, setView] = useState<View>("overview");
  const [runs, setRuns] = useState<ProcessingRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [course, setCourse] = useState("");
  const [section, setSection] = useState("");
  const [exam, setExam] = useState("Internal Assessment 1");
  const [maxScore, setMaxScore] = useState(20);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [activeRun, setActiveRun] = useState<ProcessingRun | null>(null);
  const [rows, setRows] = useState<MarkRecord[]>([]);
  const [filter, setFilter] = useState<"all" | "flagged" | "verified">("all");
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<Toast>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const initializedTourFor = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getAuthenticatedUser()
      .then((user) => {
        if (mounted) setAuthUser(user);
      })
      .catch(() => {
        if (mounted) setAuthUser(null);
      });
    const unsubscribe = listenForAuthChanges((user) => {
      if (mounted) setAuthUser(user);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authUser) {
      setRuns([]);
      return;
    }
    let mounted = true;
    setRunsLoading(true);
    loadRuns()
      .then((savedRuns) => {
        if (mounted) setRuns(savedRuns);
      })
      .catch((error) => {
        if (mounted)
          setToast({
            tone: "error",
            message: errorMessage(error, "Could not load saved marksheets."),
          });
      })
      .finally(() => {
        if (mounted) setRunsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [authUser]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!authUser || initializedTourFor.current === authUser.id) return;
    initializedTourFor.current = authUser.id;
    try {
      if (!window.localStorage.getItem(`${TOUR_STORAGE_KEY}:${authUser.id}`)) {
        window.localStorage.setItem(`${TOUR_STORAGE_KEY}:${authUser.id}`, "seen");
        setToast({
          tone: "info",
          message:
            "Start with New extraction. Every successful import is saved to your private cloud workspace.",
        });
      }
    } catch {
      // This preference is optional; academic data never uses localStorage.
    }
  }, [authUser]);

  const flaggedCount = rows.filter((row) => row.status === "flagged").length;
  const verifiedCount = rows.length - flaggedCount;
  const filteredRows = rows.filter((row) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "flagged" ? row.status === "flagged" : row.status !== "flagged");
    const normalized = query.trim().toLowerCase();
    return (
      matchesFilter &&
      (!normalized ||
        row.rollNumber.toLowerCase().includes(normalized) ||
        row.studentName.toLowerCase().includes(normalized))
    );
  });

  const totals = useMemo(() => {
    const total = runs.reduce((sum, run) => sum + run.totalRecords, 0);
    const flagged = runs.reduce((sum, run) => sum + run.flaggedRecords, 0);
    const verified = runs.reduce((sum, run) => sum + run.verifiedRecords, 0);
    const approved = runs.filter((run) => run.status === "approved").length;
    return {
      total,
      flagged,
      verified,
      approved,
      rate: total ? Math.round((verified / total) * 1000) / 10 : 0,
    };
  }, [runs]);

  if (authUser === undefined) return <AuthLoading />;
  if (authUser === null) return <EmailAuthScreen onAuthenticated={setAuthUser} />;

  const displayName = authUser.name.split(" ")[0] || "Faculty";
  const initials =
    authUser.name
      .split(" ")
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "FM";

  const resetWorkspace = () => {
    setFile(null);
    setRows([]);
    setActiveRun(null);
    setFilter("all");
    setQuery("");
    setProgress(0);
    setProgressMessage("");
  };

  const logout = async () => {
    try {
      await signOut();
      setProfileOpen(false);
      resetWorkspace();
      setRuns([]);
      setAuthUser(null);
    } catch (error) {
      setToast({ tone: "error", message: errorMessage(error, "Could not sign out.") });
    }
  };

  const selectFile = (chosen?: File) => {
    if (!chosen) return;
    if (chosen.size > 10 * 1024 * 1024)
      return setToast({ tone: "error", message: "That file is larger than 10 MB." });
    if (!isSupportedMarksheet(chosen))
      return setToast({ tone: "error", message: "Please choose a CSV or PDF file." });
    setFile(chosen);
    setRows([]);
    setActiveRun(null);
  };

  const startUpload = () => {
    resetWorkspace();
    setView("upload");
    window.setTimeout(
      () =>
        document
          .querySelector(".upload-panel")
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      40,
    );
  };

  const extractMarks = async () => {
    if (!file) return setToast({ tone: "error", message: "Choose a marksheet first." });
    if (!course.trim() || !section.trim() || !exam.trim())
      return setToast({
        tone: "error",
        message: "Complete the course, class, and examination details.",
      });
    if (!Number.isFinite(maxScore) || maxScore < 1 || maxScore > 500)
      return setToast({ tone: "error", message: "Maximum marks must be between 1 and 500." });

    setProcessing(true);
    setProgress(5);
    setProgressMessage("Preparing marksheet");
    try {
      const extracted = await extractMarksheet(file, maxScore, (nextProgress, message) => {
        setProgress(nextProgress);
        setProgressMessage(message);
      });
      if (!extracted.rows.length)
        throw new Error("No student rows were parsed, so nothing was saved.");
      setProgress(96);
      setProgressMessage("Saving source and parsed rows");
      const savedRun = await createRun({
        file,
        course,
        section,
        exam,
        maxScore,
        sourceKind: extracted.sourceKind,
        extractionMethod: extracted.extractionMethod,
        rows: extracted.rows,
      });
      setProgress(100);
      setRows(extracted.rows);
      setActiveRun(savedRun);
      setRuns((current) => [savedRun, ...current.filter((run) => run.id !== savedRun.id)]);
      setToast({
        tone: "success",
        message: `${savedRun.totalRecords} parsed records and the source ${savedRun.sourceKind.toUpperCase()} were saved. ${savedRun.flaggedRecords} need review.`,
      });
    } catch (error) {
      setProgress(0);
      setProgressMessage("");
      setToast({ tone: "error", message: errorMessage(error, "Could not process this file.") });
    } finally {
      setProcessing(false);
    }
  };

  const updateRow = (id: string, field: "rollNumber" | "studentName" | "score", value: string) => {
    setRows((current) =>
      validateRows(
        current.map((row) =>
          row.id === id
            ? {
                ...row,
                [field]: field === "score" ? (value === "" ? null : Number(value)) : value,
                confidence: 1,
              }
            : row,
        ),
      ),
    );
  };

  const approveClean = () => {
    setRows((current) =>
      current.map((row) => (row.status === "verified" ? { ...row, status: "approved" } : row)),
    );
    setToast({
      tone: "info",
      message: `${verifiedCount} clean records marked approved. Save the draft or finalize to persist this change.`,
    });
  };

  const saveRun = async (finalize = false) => {
    if (!activeRun) return;
    const validated = validateRows(rows, finalize);
    const remainingFlagged = validated.filter((row) => row.status === "flagged").length;
    if (finalize && remainingFlagged) {
      return setToast({
        tone: "error",
        message: `Resolve ${remainingFlagged} flagged ${remainingFlagged === 1 ? "record" : "records"} before final approval.`,
      });
    }

    setProcessing(true);
    setProgressMessage(finalize ? "Finalizing approved records" : "Saving draft");
    try {
      const savedRun = await persistRun(activeRun, validated, finalize ? "approved" : "review");
      setRows(validated);
      setActiveRun(savedRun);
      setRuns((current) => current.map((run) => (run.id === savedRun.id ? savedRun : run)));
      setToast({
        tone: "success",
        message: finalize
          ? "Approved marks were saved to your cloud workspace."
          : "Draft changes were saved to your cloud workspace.",
      });
    } catch (error) {
      setToast({ tone: "error", message: errorMessage(error, "Could not save changes.") });
    } finally {
      setProcessing(false);
      setProgressMessage("");
    }
  };

  const openRun = async (run: ProcessingRun) => {
    setProcessing(true);
    setProgressMessage("Loading saved records");
    try {
      const savedRows = await loadRunRows(run.id);
      setActiveRun({ ...run, rows: savedRows });
      setRows(savedRows);
      setFile(null);
      setCourse(run.course);
      setSection(run.section);
      setExam(run.exam);
      setMaxScore(run.maxScore);
      setFilter("all");
      setQuery("");
      setView("upload");
    } catch (error) {
      setToast({
        tone: "error",
        message: errorMessage(error, "Could not load this saved marksheet."),
      });
    } finally {
      setProcessing(false);
      setProgressMessage("");
    }
  };

  const viewSource = async () => {
    if (!activeRun) return;
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    try {
      const url = await createSourceUrl(activeRun.filePath);
      if (popup) popup.location.href = url;
      else window.location.href = url;
    } catch (error) {
      popup?.close();
      setToast({ tone: "error", message: errorMessage(error, "Could not open the source file.") });
    }
  };

  const exportCsv = () => {
    if (!rows.length)
      return setToast({ tone: "info", message: "Open a saved marksheet before exporting." });
    const quote = (value: string | number | null) =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [
      "Roll number,Student name,Marks,Maximum,Status",
      ...rows.map((row) =>
        [row.rollNumber, row.studentName, row.score, row.maxScore, row.status].map(quote).join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(activeRun?.course ?? course).replaceAll(" ", "-").toLowerCase()}-${(activeRun?.section ?? section).toLowerCase()}-marks.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setToast({ tone: "success", message: "The currently displayed parsed records were exported." });
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button
          className="brand-mark"
          onClick={() => setView("overview")}
          aria-label="MarkMaxxer home"
        >
          M
        </button>
        <nav aria-label="Primary navigation" className="side-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              onClick={() => setView(item.id)}
              aria-label={item.label}
              aria-current={view === item.id ? "page" : undefined}
              title={item.label}
            >
              <NavIcon name={item.icon} />
            </button>
          ))}
        </nav>
        <div className="profile-wrap">
          <button
            className="avatar"
            aria-label="Faculty profile"
            onClick={() => setProfileOpen((open) => !open)}
          >
            {initials}
          </button>
          {profileOpen && (
            <div className="profile-card">
              <strong>{authUser.name}</strong>
              <span>{authUser.email}</span>
              <small>Authenticated cloud workspace</small>
              <button className="profile-logout" onClick={logout}>
                <LogOut size={13} /> Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">Faculty workspace · {academicYear()}</div>
            <h1>
              {view === "overview"
                ? `Welcome, Prof. ${displayName}`
                : view === "upload"
                  ? rows.length
                    ? "Verify parsed marks"
                    : "New marks extraction"
                  : view === "records"
                    ? "Marksheets & records"
                    : "Verification insights"}
            </h1>
          </div>
          <div className="top-actions">
            <button
              className="icon-button"
              aria-label="Review notifications"
              title="Review notifications"
              onClick={() =>
                setToast({
                  tone: "info",
                  message: totals.flagged
                    ? `${totals.flagged} saved entries need review.`
                    : "No saved entries currently need review.",
                })
              }
            >
              <Bell size={16} />
              {totals.flagged > 0 && <span className="notification-dot" />}
            </button>
            <button className="primary-button" onClick={startUpload}>
              <Plus size={16} /> Upload marksheet
            </button>
          </div>
        </header>

        {view === "overview" && (
          <Overview
            runs={runs}
            totals={totals}
            loading={runsLoading}
            startUpload={startUpload}
            openRecords={() => setView("records")}
            openRun={openRun}
          />
        )}
        {view === "upload" && (
          <UploadWorkspace
            file={file}
            setFile={selectFile}
            course={course}
            setCourse={setCourse}
            section={section}
            setSection={setSection}
            exam={exam}
            setExam={setExam}
            maxScore={maxScore}
            setMaxScore={setMaxScore}
            extracting={processing}
            progress={progress}
            progressMessage={progressMessage}
            extractMarks={extractMarks}
            activeRun={activeRun}
            rows={rows}
            filteredRows={filteredRows}
            flaggedCount={flaggedCount}
            verifiedCount={verifiedCount}
            filter={filter}
            setFilter={setFilter}
            query={query}
            setQuery={setQuery}
            updateRow={updateRow}
            approveClean={approveClean}
            saveRun={saveRun}
            exportCsv={exportCsv}
            viewSource={viewSource}
          />
        )}
        {view === "records" && (
          <RecordsView
            runs={runs}
            loading={runsLoading || processing}
            startUpload={startUpload}
            openRun={openRun}
          />
        )}
        {view === "reports" && <ReportsView runs={runs} totals={totals} />}
      </section>

      {toast && (
        <div className={`toast ${toast.tone}`} role="status">
          <span>
            {toast.tone === "success" ? (
              <Check size={15} />
            ) : toast.tone === "error" ? (
              <CircleAlert size={15} />
            ) : (
              <Info size={15} />
            )}
          </span>
          {toast.message}
          <button onClick={() => setToast(null)} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}
      {processing && rows.length > 0 && (
        <div className="save-indicator" role="status">
          <LoaderCircle size={14} /> {progressMessage || "Working…"}
        </div>
      )}
    </main>
  );
}

function AuthLoading() {
  return (
    <main className="auth-loading">
      <div className="auth-brand">
        <span>M</span>
        <strong>MarkMaxxer</strong>
      </div>
      <div className="auth-loading-card" aria-label="Preparing your private workspace">
        <div className="loading-line wide" />
        <div className="loading-line medium" />
        <div className="loading-line short" />
      </div>
      <p>Preparing your private workspace</p>
    </main>
  );
}

function EmailAuthScreen({ onAuthenticated }: { onAuthenticated: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const configurationError = cloudConfigurationError();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    try {
      if (mode === "signin") {
        onAuthenticated(await signIn(email, password));
      } else {
        const result = await signUp(name, email, password);
        if (result.user) onAuthenticated(result.user);
        else if (result.confirmationRequired)
          setNotice("Account created. Check your email to confirm it, then sign in.");
      }
    } catch (submissionError) {
      setError(errorMessage(submissionError, "Unable to continue."));
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (nextMode: "signin" | "signup") => {
    setMode(nextMode);
    setError("");
    setNotice("");
    setPassword("");
  };

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <div className="auth-brand inverse">
          <span>M</span>
          <strong>MarkMaxxer</strong>
        </div>
        <div className="auth-story-copy">
          <span className="eyebrow">Faculty records, preserved</span>
          <h1>Only your uploaded marksheets. Only your parsed records.</h1>
          <p>
            Import CSV or PDF marksheets, verify the extracted rows, and continue saved drafts after
            signing in again.
          </p>
        </div>
        <div className="auth-proof truthful-proof" aria-hidden="true">
          <FileText size={42} />
          <ArrowRight size={22} />
          <ShieldCheck size={42} />
        </div>
        <div className="auth-story-footer">
          <span>Private source-file storage</span>
          <span>Owner-only database access</span>
        </div>
      </section>
      <section className="auth-form-side">
        <div className="auth-card">
          <span className="eyebrow">Private faculty access</span>
          <h2>{mode === "signin" ? "Welcome back" : "Create your workspace"}</h2>
          <p>
            {mode === "signin"
              ? "Continue from your cloud-saved drafts and records."
              : "Use your institutional email to create an isolated workspace."}
          </p>
          <div className="auth-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={mode === "signin"}
              className={mode === "signin" ? "active" : ""}
              onClick={() => switchMode("signin")}
            >
              Sign in
            </button>
            <button
              role="tab"
              aria-selected={mode === "signup"}
              className={mode === "signup" ? "active" : ""}
              onClick={() => switchMode("signup")}
            >
              Create account
            </button>
          </div>
          <form onSubmit={submit} className="auth-form">
            {mode === "signup" && (
              <label>
                Full name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  placeholder="Prof. Ananya Krishnan"
                  minLength={2}
                  maxLength={80}
                  required
                />
              </label>
            )}
            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="faculty@college.edu"
                maxLength={254}
                required
              />
            </label>
            <label>
              Password
              <div className="password-field">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  placeholder="Minimum 8 characters"
                  minLength={8}
                  maxLength={128}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </label>
            {(configurationError || error) && (
              <div className="auth-error" role="alert">
                <span>
                  <CircleAlert size={14} />
                </span>
                {configurationError || error}
              </div>
            )}
            {notice && (
              <div className="auth-notice" role="status">
                <span>
                  <CircleCheck size={14} />
                </span>
                {notice}
              </div>
            )}
            <button className="auth-submit" disabled={loading || Boolean(configurationError)}>
              {loading
                ? "Please wait…"
                : mode === "signin"
                  ? "Sign in securely"
                  : "Create secure account"}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="auth-legal">
            Use MarkMaxxer only for academic records you are authorized to process.
          </p>
        </div>
      </section>
    </main>
  );
}

type Totals = { total: number; verified: number; flagged: number; approved: number; rate: number };

function Overview({
  runs,
  totals,
  loading,
  startUpload,
  openRecords,
  openRun,
}: {
  runs: ProcessingRun[];
  totals: Totals;
  loading: boolean;
  startUpload: () => void;
  openRecords: () => void;
  openRun: (run: ProcessingRun) => void;
}) {
  return (
    <div className="dashboard-grid">
      <section className="hero-card">
        <div className="hero-copy">
          <span className="ai-pill">
            <Sparkles size={12} /> Parsed from your source
          </span>
          <h2>Turn CSV and PDF marksheets into reviewable records.</h2>
          <p>
            Every row displayed here comes from a file you uploaded. Successful imports are saved
            with their source document.
          </p>
          <button className="dark-button" onClick={startUpload}>
            Start new extraction <ArrowRight size={17} />
          </button>
        </div>
        <div className="scan-visual" aria-hidden="true">
          <div className="paper-sheet">
            <div className="paper-head">
              <span />
              <span />
            </div>
            {[0, 1, 2, 3].map((row) => (
              <div className="paper-row blank-paper-row" key={row}>
                <span className="row-line" />
                <i>
                  <Check size={9} />
                </i>
              </div>
            ))}
          </div>
          <span className="scan-line" />
          <span className="confidence-tag">CSV + PDF</span>
        </div>
      </section>
      <section className="summary-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Saved workspace</span>
            <h3>Processing summary</h3>
          </div>
          <button className="plain-button" onClick={openRecords}>
            View records
          </button>
        </div>
        <div className="stat-row">
          <div className="stat">
            <strong>{totals.total}</strong>
            <span>Records processed</span>
            <small>
              from {runs.length} uploaded {runs.length === 1 ? "file" : "files"}
            </small>
          </div>
          <div className="stat">
            <strong>{totals.rate}%</strong>
            <span>Clean records</span>
            <small>{totals.verified} entries without flags</small>
          </div>
          <div className="stat">
            <strong>{totals.flagged}</strong>
            <span>Need attention</span>
            <small className={totals.flagged ? "warning" : ""}>
              {totals.flagged ? "Review required" : "Nothing pending"}
            </small>
          </div>
        </div>
      </section>
      <section className="recent-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Latest activity</span>
            <h3>Recent marksheets</h3>
          </div>
          <button className="plain-button" onClick={openRecords}>
            See all
          </button>
        </div>
        {loading ? (
          <LoadingState label="Loading saved marksheets" />
        ) : runs.length ? (
          <div className="sheet-list">
            {runs.slice(0, 3).map((run) => (
              <article className="sheet-row" key={run.id}>
                <div className="file-icon">
                  <FileText size={16} />
                </div>
                <div className="sheet-copy">
                  <strong>
                    {run.section} · {run.course}
                  </strong>
                  <span>
                    {run.totalRecords} parsed records · {run.exam} · {formatAgo(run.createdAt)}
                  </span>
                </div>
                <span className={`status ${run.status === "approved" ? "green" : "amber"}`}>
                  {run.status === "approved" ? "Approved" : "Draft"}
                </span>
                <button
                  className="row-action"
                  onClick={() => openRun(run)}
                  aria-label={`Open ${run.course}`}
                >
                  <ChevronRight size={15} />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No uploaded marksheets yet"
            detail="Your first successful CSV or PDF import will appear here."
          />
        )}
      </section>
      <aside className="attention-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Review queue</span>
            <h3>Needs attention</h3>
          </div>
          <span className="count-badge">{totals.flagged}</span>
        </div>
        <div
          className="progress-ring"
          style={{
            background: `conic-gradient(var(--green) 0 ${totals.rate}%, #e9eeeb ${totals.rate}% 100%)`,
          }}
        >
          <div>
            <strong>{totals.rate}%</strong>
            <span>clean</span>
          </div>
        </div>
        <div className="actual-state">
          <CircleCheck size={18} />
          <p>
            <strong>
              {totals.flagged
                ? `${totals.flagged} parsed entries need review`
                : "No flagged entries"}
            </strong>
            <small>
              {totals.flagged
                ? "Open a saved draft to correct them."
                : "Upload a marksheet to add records."}
            </small>
          </p>
        </div>
        <button className="review-button" onClick={openRecords}>
          Open saved records <ChevronRight size={14} />
        </button>
      </aside>
    </div>
  );
}

type UploadProps = {
  file: File | null;
  setFile: (file?: File) => void;
  course: string;
  setCourse: (value: string) => void;
  section: string;
  setSection: (value: string) => void;
  exam: string;
  setExam: (value: string) => void;
  maxScore: number;
  setMaxScore: (value: number) => void;
  extracting: boolean;
  progress: number;
  progressMessage: string;
  extractMarks: () => void;
  activeRun: ProcessingRun | null;
  rows: MarkRecord[];
  filteredRows: MarkRecord[];
  flaggedCount: number;
  verifiedCount: number;
  filter: "all" | "flagged" | "verified";
  setFilter: (value: "all" | "flagged" | "verified") => void;
  query: string;
  setQuery: (value: string) => void;
  updateRow: (id: string, field: "rollNumber" | "studentName" | "score", value: string) => void;
  approveClean: () => void;
  saveRun: (finalize?: boolean) => void;
  exportCsv: () => void;
  viewSource: () => void;
};

function UploadWorkspace(props: UploadProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    props.setFile(event.dataTransfer.files[0]);
  };
  return (
    <div className="workflow-shell">
      <div className="workflow-top">
        <div className="stepper">
          <span className="done">
            <b>1</b> Upload
          </span>
          <i />
          <span className={props.rows.length ? "done" : "current"}>
            <b>2</b> Verify
          </span>
          <i />
          <span className={props.activeRun?.status === "approved" ? "done" : ""}>
            <b>3</b> Approve
          </span>
        </div>
        {props.rows.length > 0 && (
          <div className="workflow-actions">
            <button
              className="secondary-button"
              onClick={() => props.saveRun(false)}
              disabled={props.extracting}
            >
              Save draft
            </button>
            <button
              className="primary-button"
              onClick={() => props.saveRun(true)}
              disabled={props.extracting}
            >
              Approve & finalize
            </button>
          </div>
        )}
      </div>
      {!props.rows.length ? (
        <section className="upload-panel">
          <div className="upload-copy">
            <span className="eyebrow">Step 1 · Source document</span>
            <h2>Upload a marksheet</h2>
            <p>
              Use a CSV export or a clear PDF. If no student rows can be parsed, the app saves
              nothing and asks for a better source.
            </p>
            <div className="trust-row">
              <span>
                <ShieldCheck size={13} /> Private cloud storage
              </span>
              <span>
                <CircleCheck size={13} /> Real row validation
              </span>
              <span>
                <Check size={13} /> Faculty approval required
              </span>
            </div>
          </div>
          <div
            className={`drop-zone ${props.file ? "has-file" : ""}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={drop}
            onClick={() => fileInput.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") fileInput.current?.click();
            }}
          >
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.csv,application/pdf,text/csv"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                props.setFile(event.target.files?.[0])
              }
            />
            {props.file ? (
              <>
                <div className="selected-file-icon">
                  <FileText size={25} />
                </div>
                <strong>{props.file.name}</strong>
                <span>{(props.file.size / 1024).toFixed(0)} KB · Ready to process</span>
                <button
                  className="plain-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    fileInput.current?.click();
                  }}
                >
                  Replace file
                </button>
              </>
            ) : (
              <>
                <div className="upload-icon">
                  <Upload size={25} />
                </div>
                <strong>Drop your marksheet here</strong>
                <span>or click to browse · PDF or CSV · Max 10 MB</span>
                <button className="secondary-button" type="button">
                  Choose file
                </button>
              </>
            )}
          </div>
          <div className="metadata-grid">
            <label>
              Course / subject
              <input
                value={props.course}
                onChange={(event) => props.setCourse(event.target.value)}
                placeholder="e.g. Data Structures"
                maxLength={120}
              />
            </label>
            <label>
              Class / section
              <input
                value={props.section}
                onChange={(event) => props.setSection(event.target.value)}
                placeholder="e.g. CSE-A"
                maxLength={80}
              />
            </label>
            <label>
              Examination
              <select value={props.exam} onChange={(event) => props.setExam(event.target.value)}>
                <option>Internal Assessment 1</option>
                <option>Internal Assessment 2</option>
                <option>Internal Assessment 3</option>
                <option>Model Examination</option>
              </select>
            </label>
            <label>
              Maximum marks
              <input
                type="number"
                min="1"
                max="500"
                value={props.maxScore}
                onChange={(event) => props.setMaxScore(Number(event.target.value))}
              />
            </label>
          </div>
          <div className="upload-footer">
            <p>
              <span>CSV:</span> Roll number, Student name, Marks. <span>PDF:</span> one row per
              student, ending with the mark.
            </p>
            <button
              className="dark-button extract-button"
              disabled={!props.file || props.extracting}
              onClick={props.extractMarks}
            >
              {props.extracting
                ? `${props.progressMessage || "Reading marksheet"}… ${props.progress}%`
                : "Extract, validate & save"}{" "}
              <ArrowRight size={17} />
            </button>
          </div>
          {props.extracting && (
            <div className="processing-bar">
              <span style={{ width: `${props.progress}%` }} />
            </div>
          )}
        </section>
      ) : (
        <VerificationTable {...props} />
      )}
    </div>
  );
}

function VerificationTable(props: UploadProps) {
  return (
    <section className="verification-card">
      <div className="verification-head">
        <div>
          <span className="eyebrow">Step 2 · Faculty verification</span>
          <h2>
            {props.course} · {props.section}
          </h2>
          <p>
            {props.activeRun?.filename} · {props.exam} · maximum {props.maxScore} marks · saved{" "}
            {props.activeRun ? formatAgo(props.activeRun.updatedAt) : ""}
          </p>
        </div>
        <div className="confidence-summary">
          <span>
            <b>{props.rows.length}</b>Total
          </span>
          <span className="good">
            <b>{props.verifiedCount}</b>Clean
          </span>
          <span className="bad">
            <b>{props.flaggedCount}</b>Flagged
          </span>
        </div>
      </div>
      <div className="table-toolbar">
        <div className="filter-tabs">
          <button
            className={props.filter === "all" ? "active" : ""}
            onClick={() => props.setFilter("all")}
          >
            All {props.rows.length}
          </button>
          <button
            className={props.filter === "flagged" ? "active" : ""}
            onClick={() => props.setFilter("flagged")}
          >
            Flagged {props.flaggedCount}
          </button>
          <button
            className={props.filter === "verified" ? "active" : ""}
            onClick={() => props.setFilter("verified")}
          >
            Clean {props.verifiedCount}
          </button>
        </div>
        <div className="table-tools">
          <label className="search-box">
            <Search size={14} />
            <input
              value={props.query}
              onChange={(event) => props.setQuery(event.target.value)}
              placeholder="Find student…"
              aria-label="Find student"
            />
          </label>
          <button className="secondary-button" onClick={props.viewSource}>
            View source
          </button>
          <button className="secondary-button" onClick={props.exportCsv}>
            Export CSV
          </button>
          <button className="primary-button compact" onClick={props.approveClean}>
            Approve clean
          </button>
        </div>
      </div>
      <div className="records-table-wrap">
        <table className="records-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Roll number</th>
              <th>Student name</th>
              <th>Parsed mark</th>
              <th>Confidence</th>
              <th>Validation</th>
            </tr>
          </thead>
          <tbody>
            {props.filteredRows.map((row, index) => (
              <tr key={row.id} className={row.status === "flagged" ? "flagged-row" : ""}>
                <td>{String(index + 1).padStart(2, "0")}</td>
                <td>
                  <input
                    aria-label={`Roll number for ${row.studentName}`}
                    value={row.rollNumber}
                    onChange={(event) => props.updateRow(row.id, "rollNumber", event.target.value)}
                    className={!row.rollNumber ? "invalid" : ""}
                  />
                </td>
                <td>
                  <input
                    aria-label="Student name"
                    value={row.studentName}
                    onChange={(event) => props.updateRow(row.id, "studentName", event.target.value)}
                    className={!row.studentName ? "invalid" : ""}
                  />
                </td>
                <td>
                  <div className="mark-input">
                    <input
                      aria-label={`Marks for ${row.studentName}`}
                      type="number"
                      value={row.score ?? ""}
                      onChange={(event) => props.updateRow(row.id, "score", event.target.value)}
                      className={
                        row.issue?.includes("range") || row.issue === "Missing mark"
                          ? "invalid"
                          : ""
                      }
                    />
                    <span>/ {row.maxScore}</span>
                  </div>
                </td>
                <td>
                  <div className="confidence">
                    <span>
                      <i style={{ width: `${Math.round(row.confidence * 100)}%` }} />
                    </span>
                    <b>{Math.round(row.confidence * 100)}%</b>
                  </div>
                </td>
                <td>
                  {row.issue ? (
                    <span className="validation-badge problem">
                      <CircleAlert size={12} /> {row.issue}
                    </span>
                  ) : (
                    <span className="validation-badge okay">
                      <Check size={12} /> {row.status === "approved" ? "Approved" : "Verified"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="verification-footer">
        <p>
          <strong>
            {props.flaggedCount
              ? `${props.flaggedCount} entries still need attention.`
              : "All parsed entries are ready."}
          </strong>
          <span>Editing a value runs validation again; save to persist it.</span>
        </p>
        <div>
          <button
            className="secondary-button"
            onClick={() => props.saveRun(false)}
            disabled={props.extracting}
          >
            Save progress
          </button>
          <button
            className="primary-button"
            onClick={() => props.saveRun(true)}
            disabled={props.flaggedCount > 0 || props.extracting}
          >
            Approve & finalize <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </section>
  );
}

function RecordsView({
  runs,
  loading,
  startUpload,
  openRun,
}: {
  runs: ProcessingRun[];
  loading: boolean;
  startUpload: () => void;
  openRun: (run: ProcessingRun) => void;
}) {
  const [status, setStatus] = useState<"all" | "review" | "approved">("all");
  const visible = runs.filter((run) => status === "all" || run.status === status);
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <span className="eyebrow">Source of truth</span>
          <h2>Marksheets & records</h2>
          <p>
            Every item below came from a successful CSV or PDF import and is stored under the
            signed-in faculty account.
          </p>
        </div>
        <button className="dark-button" onClick={startUpload}>
          New extraction <Plus size={16} />
        </button>
      </section>
      <section className="records-card">
        <div className="table-toolbar">
          <div className="filter-tabs">
            <button className={status === "all" ? "active" : ""} onClick={() => setStatus("all")}>
              All
            </button>
            <button
              className={status === "review" ? "active" : ""}
              onClick={() => setStatus("review")}
            >
              Drafts
            </button>
            <button
              className={status === "approved" ? "active" : ""}
              onClick={() => setStatus("approved")}
            >
              Approved
            </button>
          </div>
        </div>
        {loading ? (
          <LoadingState label="Loading saved records" />
        ) : (
          <div className="run-list">
            <div className="run-list-head">
              <span>Marksheet</span>
              <span>Class</span>
              <span>Progress</span>
              <span>Status</span>
              <span>Uploaded</span>
            </div>
            {visible.map((run) => {
              const percent = run.totalRecords
                ? Math.round((run.verifiedRecords / run.totalRecords) * 100)
                : 0;
              return (
                <article className="run-row" key={run.id}>
                  <button className="run-file open-run-file" onClick={() => openRun(run)}>
                    <div className="file-icon">
                      <FileText size={16} />
                    </div>
                    <p>
                      <strong>{run.course}</strong>
                      <span>
                        {run.filename} · {run.exam} · {run.extractionMethod}
                      </span>
                    </p>
                  </button>
                  <strong>{run.section}</strong>
                  <div className="run-progress">
                    <span>
                      <i style={{ width: `${percent}%` }} />
                    </span>
                    <b>{percent}%</b>
                  </div>
                  <span className={`status ${run.status === "approved" ? "green" : "amber"}`}>
                    {run.status === "approved" ? "Approved" : `${run.flaggedRecords} to review`}
                  </span>
                  <button className="open-time" onClick={() => openRun(run)}>
                    {formatAgo(run.createdAt)} <ChevronRight size={14} />
                  </button>
                </article>
              );
            })}
          </div>
        )}
        {!loading && visible.length === 0 && (
          <EmptyState
            title="No marksheets in this view"
            detail="Change the filter or upload a CSV or PDF."
          />
        )}
      </section>
    </div>
  );
}

function ReportsView({ runs, totals }: { runs: ProcessingRun[]; totals: Totals }) {
  const courses = [...new Set(runs.map((run) => run.course))].slice(0, 5).map((course) => {
    const related = runs.filter((run) => run.course === course);
    const total = related.reduce((sum, run) => sum + run.totalRecords, 0);
    const verified = related.reduce((sum, run) => sum + run.verifiedRecords, 0);
    return { course, total, rate: total ? Math.round((verified / total) * 100) : 0 };
  });
  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <span className="eyebrow">Saved-data summary</span>
          <h2>Verification insights</h2>
          <p>
            These figures are calculated only from the signed-in faculty member's persisted imports.
          </p>
        </div>
      </section>
      <div className="report-stats">
        <article>
          <span>Processed records</span>
          <strong>{totals.total}</strong>
          <small>across {runs.length} uploaded marksheets</small>
        </article>
        <article>
          <span>Clean-record rate</span>
          <strong>{totals.rate}%</strong>
          <small>{totals.verified} entries without flags</small>
        </article>
        <article>
          <span>Faculty review load</span>
          <strong>{totals.flagged}</strong>
          <small>saved entries requiring attention</small>
        </article>
        <article>
          <span>Approved marksheets</span>
          <strong>{totals.approved}</strong>
          <small>of {runs.length} saved imports</small>
        </article>
      </div>
      <section className="chart-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">By subject</span>
            <h3>Clean parsed-record rate</h3>
          </div>
          <span className="chart-legend">
            <i /> Based on saved rows
          </span>
        </div>
        {courses.length ? (
          <div className="bar-chart">
            {courses.map((item) => (
              <div className="bar-row" key={item.course}>
                <span>{item.course}</span>
                <div>
                  <i style={{ width: `${item.rate}%` }} />
                </div>
                <strong>{item.rate}%</strong>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No report data yet"
            detail="Successful imports will build this report automatically."
          />
        )}
      </section>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <FileText size={22} />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="empty-state">
      <LoaderCircle className="spin" size={22} />
      <strong>{label}</strong>
    </div>
  );
}
