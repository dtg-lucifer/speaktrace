export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8989/api/v1";
export const ML_BASE = process.env.NEXT_PUBLIC_ML_URL || "http://localhost:8000";

export function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("speaktrace_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getCurrentUser(): { id?: string; email: string; credits?: number; plan?: string } | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("speaktrace_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function refreshCurrentUser(): Promise<{ id?: string; email: string; credits?: number; plan?: string } | null> {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem("speaktrace_token");
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/users/me`, {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const json = await res.json();
      const user = json.data?.user;
      if (user) {
        localStorage.setItem("speaktrace_user", JSON.stringify(user));
        window.dispatchEvent(new CustomEvent("speaktrace_user_updated", { detail: user }));
        return user;
      }
    }
  } catch {
    // ignore network errors
  }
  return getCurrentUser();
}

export async function renameJobAudio(jobId: string, filename: string): Promise<{ success: boolean; filename: string }> {
  const res = await fetch(`${API_BASE}/uploads/jobs/${jobId}/rename`, {
    method: "PATCH",
    headers: {
      ...getAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ filename }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to rename recording");
  }
  const json = await res.json();
  return json.data;
}

export function isAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(localStorage.getItem("speaktrace_token"));
}

export function logoutUser() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("speaktrace_token");
  localStorage.removeItem("speaktrace_user");
  window.location.href = "/login";
}

export async function loginWithCredentials(email: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Invalid email or password");
  }
  const json = await res.json();
  if (typeof window !== "undefined") {
    localStorage.setItem("speaktrace_token", json.data.tokens.accessToken);
    localStorage.setItem("speaktrace_user", JSON.stringify(json.data.user));
  }
  return json.data;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  media_count?: number;
}

export interface MediaAsset {
  id: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  duration_seconds: number | null;
  storage_url: string;
  status: string;
}

export interface SpeakerSnippet {
  id?: string;
  speaker_tag: string;
  snippet_url: string;
  duration_seconds: number;
  assigned_name: string | null;
}

export interface ProcessingJob {
  id: string;
  project_id: string | null;
  media_asset_id: string;
  original_filename?: string;
  duration_seconds?: number;
  storage_url?: string;
  status: string;
  current_stage: string | null;
  progress_pct: number;
  created_at: string;
  speakers?: SpeakerSnippet[];
}

export interface Transcript {
  id: string;
  job_id: string;
  project_id: string;
  format: string;
  content_text: string;
  storage_url: string | null;
  created_at: string;
}

export interface ProjectDetails {
  project: Project;
  assets: MediaAsset[];
  jobs: ProcessingJob[];
  transcripts: Transcript[];
}

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/projects`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("UNAUTHORIZED");
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch projects (${res.status})`);
  }
  const json = await res.json();
  return json.data || [];
}

export async function createProject(name: string, description?: string): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ name, description }),
  });
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("UNAUTHORIZED");
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to create project");
  }
  const json = await res.json();
  return json.data;
}

export async function fetchProjectDetails(projectId: string): Promise<ProjectDetails> {
  const res = await fetch(`${API_BASE}/projects/${projectId}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("UNAUTHORIZED");
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch project details (${res.status})`);
  }
  const json = await res.json();
  return json.data;
}

export async function uploadAudioFile(
  projectId: string,
  file: File,
  options: { export_format?: string; custom_template?: string } = {},
): Promise<{ job_id: string }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("projectId", projectId);
  formData.append("jobOptions", JSON.stringify(options));

  const res = await fetch(`${API_BASE}/uploads?projectId=${encodeURIComponent(projectId)}`, {
    method: "POST",
    headers: { ...getAuthHeaders() },
    body: formData,
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("UNAUTHORIZED");
    }
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.error || "Upload failed. Check your credit balance.");
  }

  const json = await res.json();
  return { job_id: json.data?.job?.id };
}

export async function submitSpeakerNames(
  jobId: string,
  mappings: Record<string, string>,
): Promise<void> {
  const res = await fetch(`${API_BASE}/uploads/jobs/${jobId}/speakers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ mappings }),
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("UNAUTHORIZED");
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to submit speaker labels");
  }
}

export interface RagCitation {
  job_id?: string;
  audio_url?: string;
  filename?: string;
  speaker?: string;
  start_time?: number;
  end_time?: number;
  text: string;
}

export interface StreamRagChatParams {
  projectId: string;
  query: string;
  jobId?: string;
  history?: Array<{ role: string; content: string }>;
}

export interface StreamRagChatCallbacks {
  onCitations?: (citations: RagCitation[]) => void;
  onToken?: (token: string) => void;
  onDone?: () => void;
  onError?: (err: Error) => void;
}

export async function queryRag(
  projectId: string,
  query: string,
  jobId?: string,
): Promise<{ answer: string; citations: RagCitation[] }> {
  const res = await fetch(`${ML_BASE}/api/rag/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId, query, job_id: jobId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "RAG query failed. Ensure worker is running on port 8000.");
  }
  return await res.json();
}

export async function streamRagChat(
  params: StreamRagChatParams,
  callbacks: StreamRagChatCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${ML_BASE}/api/rag/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: params.projectId,
      query: params.query,
      job_id: params.jobId,
      history: params.history,
    }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "RAG streaming failed. Ensure worker is running on port 8000.");
  }

  if (!res.body) {
    throw new Error("ReadableStream not available in response");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const dataStr = trimmed.slice(6).trim();
        if (!dataStr) continue;

        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.type === "citations" && callbacks.onCitations) {
            callbacks.onCitations(parsed.citations || []);
          } else if (parsed.type === "token" && callbacks.onToken) {
            callbacks.onToken(parsed.delta || "");
          } else if (parsed.type === "done") {
            if (callbacks.onDone) callbacks.onDone();
          } else if (parsed.type === "error") {
            if (callbacks.onError) callbacks.onError(new Error(parsed.error));
          }
        } catch {
          // ignore malformed chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
    if (callbacks.onDone) {
      callbacks.onDone();
    }
  }
}

