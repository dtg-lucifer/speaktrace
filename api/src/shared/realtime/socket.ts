import type { Server as HTTPServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import type { DomainEventBus } from "~/shared/events";
import { log } from "~/shared/middlewares";
import { activeWebSocketsGauge } from "~/shared/metrics/prometheus";

interface SetupSocketServerInput {
	eventBus: DomainEventBus;
	origins: string[];
	path: string;
	server: HTTPServer;
}

export const setupSocketServer = ({ eventBus, origins, path, server }: SetupSocketServerInput): SocketIOServer => {
	const io = new SocketIOServer(server, {
		cors: {
			origin: origins,
			credentials: true,
			methods: ["GET", "POST"],
		},
		path,
	});

	io.on("connection", (socket) => {
		activeWebSocketsGauge.inc();
		log.info(`[SOCKET] Client connected: ${socket.id}`);
		socket.emit("system:hello", {
			message: "Connected to realtime server",
			socketId: socket.id,
		});

		socket.on("join:job", (jobId: string) => {
			socket.join(`job:${jobId}`);
			log.info(`[SOCKET] Client ${socket.id} joined room: job:${jobId}`);
			socket.emit("system:info", {
				message: `Joined room for job ${jobId}`,
			});
		});

		socket.on("join:project", (projectId: string) => {
			socket.join(`project:${projectId}`);
			log.info(`[SOCKET] Client ${socket.id} joined room: project:${projectId}`);
			socket.emit("system:info", {
				message: `Joined room for project ${projectId}`,
			});
		});

		socket.on("leave:project", (projectId: string) => {
			socket.leave(`project:${projectId}`);
			log.info(`[SOCKET] Client ${socket.id} left room: project:${projectId}`);
		});

		socket.on("disconnect", (reason) => {
			activeWebSocketsGauge.dec();
			log.info(`[SOCKET] Client disconnected: ${socket.id} (${reason})`);
		});
	});

	eventBus.on("auth.user.registered", (payload) => {
		io.emit("auth:user-registered", payload);
	});

	eventBus.on("queue.job.enqueued", (payload) => {
		io.emit("queue:job-enqueued", payload);
	});

	eventBus.on("job.progress.updated", (payload) => {
		log.info(`[SOCKET] Broadcasting job progress update: ${payload.jobId} - ${payload.status} (${payload.progressPct}%)`);
		// Broadcast globally
		io.emit("job:progress", payload);
		// Broadcast to job-specific room
		io.to(`job:${payload.jobId}`).emit("job:progress", payload);
		// Broadcast to project-specific room if projectId is present
		if (payload.projectId) {
			io.to(`project:${payload.projectId}`).emit("job:progress", payload);
		}
	});

	return io;
};
