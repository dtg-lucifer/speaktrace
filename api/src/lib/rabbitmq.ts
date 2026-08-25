/**
 * RabbitMQ publisher singleton.
 *
 * Wraps amqplib with:
 *  - lazy connect with exponential-backoff reconnect
 *  - topic exchange publish (fire-and-forget with persistent delivery)
 *  - graceful close
 *  - standard SpeakTrace event envelope
 */
// biome-ignore lint/correctness/noUnresolvedImports: amqplib lacks a proper exports field but resolves correctly at runtime
import amqplib, { type Channel, type ChannelModel } from "amqplib";
import { configManager } from "~/config";
import { logger } from "~/shared/logging";

// ─── Standard event envelope ─────────────────────────────────────────────────

export interface SpeakTraceEvent<P = Record<string, unknown>> {
	event_id: string;
	event_type: string;
	occurred_at: string; // ISO-8601
	tenant_id: string | null;
	project_id: string | null;
	job_id: string;
	correlation_id: string;
	idempotency_key: string;
	payload: P;
}

// ─── Publisher ───────────────────────────────────────────────────────────────

class RabbitMQPublisher {
	private connection: ChannelModel | null = null;
	private channel: Channel | null = null;
	private connecting = false;
	private exchange = "";

	async connect(): Promise<void> {
		if (this.channel) return;
		if (this.connecting) return;

		this.connecting = true;
		const cfg = configManager.getRabbitMQConfig();

		if (!cfg.enabled) {
			logger.info("[RABBITMQ] Disabled in config — skipping connection");
			this.connecting = false;
			return;
		}

		const url = Bun.env.RABBITMQ_URL ?? cfg.url;
		this.exchange = cfg.exchange;

		try {
			this.connection = await amqplib.connect(url);
			this.channel = await this.connection.createChannel();

			await this.channel.assertExchange(this.exchange, cfg.exchange_type, {
				durable: true,
			});

			this.connection.on("error", (err) => {
				logger.error("[RABBITMQ] Connection error", { err });
				this.reset();
				void this.reconnect(cfg.reconnect_delay_ms);
			});

			this.connection.on("close", () => {
				logger.warn("[RABBITMQ] Connection closed — will reconnect");
				this.reset();
				void this.reconnect(cfg.reconnect_delay_ms);
			});

			logger.info(`[RABBITMQ] Connected — exchange: ${this.exchange} (${cfg.exchange_type})`);
		} catch (err) {
			logger.error("[RABBITMQ] Failed to connect", { err });
			this.reset();
			void this.reconnect(cfg.reconnect_delay_ms);
		} finally {
			this.connecting = false;
		}
	}

	private reset(): void {
		this.channel = null;
		this.connection = null;
	}

	private async reconnect(delayMs: number): Promise<void> {
		await new Promise((r) => setTimeout(r, delayMs));
		await this.connect();
	}

	/**
	 * Publish a SpeakTrace event to the topic exchange.
	 * Silently drops the message if the channel is not ready (logs a warning).
	 */
	publish<P = Record<string, unknown>>(routingKey: string, event: SpeakTraceEvent<P>): void {
		if (!this.channel) {
			logger.warn(`[RABBITMQ] Channel not ready — dropping event: ${routingKey}`);
			return;
		}

		const content = Buffer.from(JSON.stringify(event));

		try {
			this.channel.publish(this.exchange, routingKey, content, {
				persistent: true,
				contentType: "application/json",
				messageId: event.event_id,
				timestamp: Math.floor(Date.now() / 1000),
				headers: {
					"x-event-type": event.event_type,
					"x-correlation-id": event.correlation_id,
					"x-tenant-id": event.tenant_id ?? "",
				},
			});
		} catch (err) {
			logger.error(`[RABBITMQ] Failed to publish ${routingKey}`, { err });
		}
	}

	/**
	 * Subscribe to a routing key on the topic exchange.
	 * @param routingKey The routing key to subscribe to (can include wildcards)
	 * @param handler Function to call when a message is received
	 */
	async subscribe<P = Record<string, unknown>>(
		routingKey: string,
		handler: (event: SpeakTraceEvent<P>) => Promise<void> | void,
	): Promise<void> {
		if (!this.channel) {
			await this.connect();
		}

		if (!this.channel) {
			logger.error("[RABBITMQ] Cannot subscribe — channel not available");
			return;
		}

		try {
			const cfg = configManager.getRabbitMQConfig();

			// Assert the exchange exists
			await this.channel.assertExchange(this.exchange, cfg.exchange_type, {
				durable: true,
			});

			// Create a temporary queue
			const q = await this.channel.assertQueue("", { exclusive: true });

			// Bind the queue to the exchange with the routing key
			await this.channel.bindQueue(q.queue, this.exchange, routingKey);

			// Consume messages from the queue
			await this.channel.consume(
				q.queue,
				async (msg) => {
					if (!msg) {
						logger.warn("[RABBITMQ] Received null message");
						return;
					}

					try {
						const content = msg.content?.toString() || "{}";
						const event = JSON.parse(content) as SpeakTraceEvent<P>;

						// Call the handler
						await handler(event);

						// Acknowledge the message
						this.channel?.ack(msg);
					} catch (err) {
						logger.error(`[RABBITMQ] Error processing message for routing key ${routingKey}`, { err });
						// Still acknowledge to prevent infinite retries of malformed messages
						this.channel?.ack(msg);
					}
				},
				{ noAck: false },
			);

			logger.info(`[RABBITMQ] Subscribed to routing key: ${routingKey}`);
		} catch (err) {
			logger.error(`[RABBITMQ] Failed to subscribe to routing key ${routingKey}`, { err });
		}
	}

	async close(): Promise<void> {
		try {
			await this.channel?.close();
			await this.connection?.close();
		} catch {
			// ignore errors on shutdown
		} finally {
			this.reset();
			logger.info("[RABBITMQ] Connection closed");
		}
	}

	get isReady(): boolean {
		return this.channel !== null;
	}
}

export const rabbitMQ = new RabbitMQPublisher();
