import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { AuthUser, MarkRecord, ProcessingRun } from "./types";

const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
const supabaseKey = (import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
  import.meta.env["VITE_SUPABASE_ANON_KEY"]) as string | undefined;

const client =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

type RunRow = {
  id: string;
  filename: string;
  file_path: string;
  mime_type: string;
  course: string;
  section: string;
  exam: string;
  max_score: number;
  source_kind: ProcessingRun["sourceKind"];
  extraction_method: ProcessingRun["extractionMethod"];
  status: ProcessingRun["status"];
  total_records: number;
  verified_records: number;
  flagged_records: number;
  created_at: string;
  updated_at: string;
};

type RecordRow = {
  id: string;
  roll_number: string;
  student_name: string;
  score: number | null;
  max_score: number;
  confidence: number;
  status: MarkRecord["status"];
  issue: string | null;
};

function requireClient(): SupabaseClient {
  if (!client) {
    throw new Error(
      "Lovable Cloud is not connected yet. Enable it, then add the Supabase URL and publishable key.",
    );
  }
  return client;
}

function toAuthUser(user: User): AuthUser {
  const metadataName = user.user_metadata["full_name"] ?? user.user_metadata["name"];
  const email = user.email ?? "";
  return {
    id: user.id,
    email,
    name:
      typeof metadataName === "string" && metadataName.trim()
        ? metadataName.trim()
        : email.split("@")[0] || "Faculty",
  };
}

function toRun(row: RunRow): ProcessingRun {
  return {
    id: row.id,
    filename: row.filename,
    filePath: row.file_path,
    mimeType: row.mime_type,
    course: row.course,
    section: row.section,
    exam: row.exam,
    maxScore: Number(row.max_score),
    sourceKind: row.source_kind,
    extractionMethod: row.extraction_method,
    status: row.status,
    totalRecords: row.total_records,
    verifiedRecords: row.verified_records,
    flaggedRecords: row.flagged_records,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRecord(row: RecordRow): MarkRecord {
  return {
    id: row.id,
    rollNumber: row.roll_number,
    studentName: row.student_name,
    score: row.score === null ? null : Number(row.score),
    maxScore: Number(row.max_score),
    confidence: Number(row.confidence),
    status: row.status,
    issue: row.issue,
  };
}

async function currentUser() {
  const { data, error } = await requireClient().auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Your session has expired. Sign in again.");
  return data.user;
}

export function cloudConfigurationError() {
  return client ? null : "Lovable Cloud is not connected to this deployment.";
}

export async function getAuthenticatedUser() {
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session?.user ? toAuthUser(data.session.user) : null;
}

export function listenForAuthChanges(callback: (user: AuthUser | null) => void) {
  if (!client) return () => undefined;
  const { data } = client.auth.onAuthStateChange((_event, session) =>
    callback(session?.user ? toAuthUser(session.user) : null),
  );
  return () => data.subscription.unsubscribe();
}

export async function signIn(email: string, password: string) {
  const { data, error } = await requireClient().auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  if (!data.user) throw new Error("Sign in did not return a user.");
  return toAuthUser(data.user);
}

export async function signUp(name: string, email: string, password: string) {
  const { data, error } = await requireClient().auth.signUp({
    email: email.trim(),
    password,
    options: { data: { full_name: name.trim() } },
  });
  if (error) throw error;
  return {
    user: data.session?.user ? toAuthUser(data.session.user) : null,
    confirmationRequired: !data.session,
  };
}

export async function signOut() {
  const { error } = await requireClient().auth.signOut();
  if (error) throw error;
}

export async function loadRuns() {
  const { data, error } = await requireClient()
    .from("processing_runs")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as RunRow[]).map(toRun);
}

export async function loadRunRows(runId: string) {
  const { data, error } = await requireClient()
    .from("mark_records")
    .select("*")
    .eq("run_id", runId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data as RecordRow[]).map(toRecord);
}

function safeFilename(filename: string) {
  return (
    filename
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(-120) || "marksheet"
  );
}

function recordPayload(ownerId: string, runId: string, rows: MarkRecord[]) {
  return rows.map((row, position) => ({
    id: row.id,
    owner_id: ownerId,
    run_id: runId,
    position,
    roll_number: row.rollNumber.trim(),
    student_name: row.studentName.trim(),
    score: row.score,
    max_score: row.maxScore,
    confidence: row.confidence,
    status: row.status,
    issue: row.issue,
  }));
}

export async function createRun(input: {
  file: File;
  course: string;
  section: string;
  exam: string;
  maxScore: number;
  sourceKind: ProcessingRun["sourceKind"];
  extractionMethod: ProcessingRun["extractionMethod"];
  rows: MarkRecord[];
}) {
  const cloud = requireClient();
  const user = await currentUser();
  const runId = crypto.randomUUID();
  const filePath = `${user.id}/${runId}/${safeFilename(input.file.name)}`;
  const mimeType = input.file.type || (input.sourceKind === "csv" ? "text/csv" : "application/pdf");
  const flaggedRecords = input.rows.filter((row) => row.status === "flagged").length;

  const { error: uploadError } = await cloud.storage
    .from("marksheets")
    .upload(filePath, input.file, {
      contentType: mimeType,
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const runPayload = {
    id: runId,
    owner_id: user.id,
    filename: input.file.name,
    file_path: filePath,
    mime_type: mimeType,
    course: input.course.trim(),
    section: input.section.trim(),
    exam: input.exam.trim(),
    max_score: input.maxScore,
    source_kind: input.sourceKind,
    extraction_method: input.extractionMethod,
    status: "review",
    total_records: input.rows.length,
    verified_records: input.rows.length - flaggedRecords,
    flagged_records: flaggedRecords,
  };

  try {
    const { data, error } = await cloud
      .from("processing_runs")
      .insert(runPayload)
      .select("*")
      .single();
    if (error) throw error;
    const { error: rowsError } = await cloud
      .from("mark_records")
      .insert(recordPayload(user.id, runId, input.rows));
    if (rowsError) throw rowsError;
    return { ...toRun(data as RunRow), rows: input.rows };
  } catch (error) {
    await cloud.from("processing_runs").delete().eq("id", runId);
    await cloud.storage.from("marksheets").remove([filePath]);
    throw error;
  }
}

export async function saveRun(
  run: ProcessingRun,
  rows: MarkRecord[],
  status: ProcessingRun["status"],
) {
  const cloud = requireClient();
  const user = await currentUser();
  const flaggedRecords = rows.filter((row) => row.status === "flagged").length;
  const { error: rowsError } = await cloud
    .from("mark_records")
    .upsert(recordPayload(user.id, run.id, rows));
  if (rowsError) throw rowsError;

  const { data, error } = await cloud
    .from("processing_runs")
    .update({
      status,
      total_records: rows.length,
      verified_records: rows.length - flaggedRecords,
      flagged_records: flaggedRecords,
      updated_at: new Date().toISOString(),
    })
    .eq("id", run.id)
    .select("*")
    .single();
  if (error) throw error;
  return { ...toRun(data as RunRow), rows };
}

export async function createSourceUrl(filePath: string) {
  const { data, error } = await requireClient()
    .storage.from("marksheets")
    .createSignedUrl(filePath, 60);
  if (error) throw error;
  return data.signedUrl;
}
