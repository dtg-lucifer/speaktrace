import { io, Socket } from "socket.io-client";
import { API_BASE } from "./api";

let socket: Socket | null = null;

export interface JobProgressEvent {
  jobId: string;
  correlationId: string;
  tenantId: string | null;
  projectId?: string | null;
  status: string;
  progressPct: number;
  currentStage: string | null;
  errorMessage?: string | null;
  speakers?: Array<{
    speaker_tag?: string;
    speakerTag?: string;
    snippet_url?: string;
    snippetUrl?: string;
    duration_seconds?: number;
    durationSeconds?: number;
  }>;
}

export function getSocket(): Socket {
  if (!socket) {
    const socketUrl = API_BASE.replace(/\/api\/v1\/?$/, "");
    socket = io(socketUrl, {
      path: "/ws",
      transports: ["websocket", "polling"],
      withCredentials: true,
      autoConnect: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socket.on("connect", () => {
      console.log("[SOCKET] Connected to realtime WebSocket:", socket?.id);
    });

    socket.on("disconnect", (reason) => {
      console.log("[SOCKET] Disconnected:", reason);
    });

    socket.on("connect_error", (error) => {
      console.warn("[SOCKET] Connection warning:", error.message);
    });
  }

  return socket;
}

export function subscribeToProject(
  projectId: string,
  onProgress: (event: JobProgressEvent) => void
): () => void {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }

  s.emit("join:project", projectId);

  const handler = (event: JobProgressEvent) => {
    // If event is for this project or general job update, notify subscriber
    if (!event.projectId || event.projectId === projectId) {
      onProgress(event);
    }
  };

  s.on("job:progress", handler);

  return () => {
    s.emit("leave:project", projectId);
    s.off("job:progress", handler);
  };
}
