import json
import uuid
from datetime import datetime
import redis.asyncio as aioredis
from src.config import settings
from src.logger import logger

from bullmq import Queue

_redis_pool = None
_bullmq_queues: dict[str, Queue] = {}


def get_bullmq_queue(queue_name: str) -> Queue:
    if queue_name not in _bullmq_queues:
        _bullmq_queues[queue_name] = Queue(queue_name, {"connection": settings.redis_url})
    return _bullmq_queues[queue_name]


async def get_redis_client():
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis_pool


async def publish_event(queue_name: str, event_type: str, job_id: str, payload: dict, correlation_id: str | None = None, tenant_id: str | None = None):
    """
    Publishes an event to the message broker (Redis BullMQ stream / list or RabbitMQ).
    """
    envelope = {
        "event_id": str(uuid.uuid4()),
        "event_type": event_type,
        "occurred_at": datetime.utcnow().isoformat() + "Z",
        "job_id": job_id,
        "tenant_id": tenant_id,
        "correlation_id": correlation_id or str(uuid.uuid4()),
        "payload": payload,
    }

    try:
        r = await get_redis_client()
        # Publish to Redis channel for realtime subscribers
        await r.publish(f"speaktrace:{queue_name}", json.dumps(envelope))

        # Push to BullMQ queue properly
        q = get_bullmq_queue(queue_name)
        await q.add(queue_name, envelope)
        logger.info("Published event to Redis/BullMQ", evt_type=event_type, queue=queue_name, job_id=job_id)
    except Exception as e:
        logger.error("Failed to publish event to Redis/BullMQ", error=str(e), evt_type=event_type)

    # If RabbitMQ is enabled
    if settings.queue_provider == "rabbitmq" and settings.rabbitmq_url:
        try:
            import aio_pika
            connection = await aio_pika.connect_robust(settings.rabbitmq_url)
            async with connection:
                channel = await connection.channel()
                exchange = await channel.declare_exchange("speak_trace", aio_pika.ExchangeType.TOPIC, durable=True)
                message = aio_pika.Message(
                    body=json.dumps(envelope).encode(),
                    content_type="application/json",
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                )
                await exchange.publish(message, routing_key=queue_name)
                logger.info("Published event to RabbitMQ", evt_type=event_type, routing_key=queue_name)
        except Exception as e:
            logger.warn("RabbitMQ publish failed", error=str(e))
