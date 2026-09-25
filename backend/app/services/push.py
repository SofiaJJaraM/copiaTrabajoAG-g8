import json
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID, uuid4

from pywebpush import WebPushException, webpush
from sqlalchemy import delete, insert, select, update
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings
from app.db.retry import run_transaction_with_retry
from app.db.schema import push_subscriptions
from app.db.session import engine

logger = logging.getLogger(__name__)


class PushSubscriptionStoreError(Exception):
    """Push subscription metadata could not be persisted or queried."""


@dataclass(frozen=True)
class PushSubscription:
    id: UUID
    user_id: UUID
    endpoint: str
    p256dh: str
    auth: str


def upsert_subscription(
    *, user_id: UUID, endpoint: str, p256dh: str, auth: str
) -> PushSubscription:
    """Register or update a subscription. Idempotent on `endpoint`."""
    subscription_id = uuid4()
    timestamp = datetime.now(UTC)

    def persist(connection) -> UUID:
        existing_id = connection.execute(
            select(push_subscriptions.c.id).where(push_subscriptions.c.endpoint == endpoint)
        ).scalar_one_or_none()
        if existing_id:
            connection.execute(
                update(push_subscriptions)
                .where(push_subscriptions.c.endpoint == endpoint)
                .values(user_id=user_id, p256dh=p256dh, auth=auth, updated_at=timestamp)
            )
            return existing_id
        connection.execute(
            insert(push_subscriptions).values(
                id=subscription_id,
                user_id=user_id,
                endpoint=endpoint,
                p256dh=p256dh,
                auth=auth,
                created_at=timestamp,
                updated_at=timestamp,
            )
        )
        return subscription_id

    try:
        result_id = run_transaction_with_retry(engine, persist)
    except SQLAlchemyError as error:
        raise PushSubscriptionStoreError from error

    return PushSubscription(
        id=result_id, user_id=user_id, endpoint=endpoint, p256dh=p256dh, auth=auth
    )


def delete_subscription(*, user_id: UUID, endpoint: str) -> None:
    """Remove one of the current user's own subscriptions."""

    def persist(connection):
        connection.execute(
            delete(push_subscriptions).where(
                push_subscriptions.c.endpoint == endpoint,
                push_subscriptions.c.user_id == user_id,
            )
        )

    try:
        run_transaction_with_retry(engine, persist)
    except SQLAlchemyError as error:
        raise PushSubscriptionStoreError from error


def deactivate_subscription(endpoint: str) -> None:
    """Remove a subscription the push service reports as gone (404/410)."""

    def persist(connection):
        connection.execute(
            delete(push_subscriptions).where(push_subscriptions.c.endpoint == endpoint)
        )

    try:
        run_transaction_with_retry(engine, persist)
    except SQLAlchemyError:
        logger.exception("Could not remove an expired push subscription")


def subscriptions_excluding(user_id: UUID) -> list[PushSubscription]:
    statement = select(push_subscriptions).where(push_subscriptions.c.user_id != user_id)
    try:
        with engine.connect() as connection:
            rows = connection.execute(statement).mappings().all()
    except SQLAlchemyError as error:
        raise PushSubscriptionStoreError from error
    return [
        PushSubscription(
            id=row["id"],
            user_id=row["user_id"],
            endpoint=row["endpoint"],
            p256dh=row["p256dh"],
            auth=row["auth"],
        )
        for row in rows
    ]


def send_notification(subscription: PushSubscription, *, title: str, body: str, url: str) -> None:
    payload = json.dumps({"title": title, "body": body, "url": url})
    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
            },
            data=payload,
            vapid_private_key=str(settings.vapid_private_key_path),
            vapid_claims={"sub": settings.vapid_subject},
        )
    except WebPushException as error:
        status_code = error.response.status_code if error.response is not None else None
        if status_code in (404, 410):
            deactivate_subscription(subscription.endpoint)
        else:
            logger.warning("Push delivery failed for a subscription: %s", error)


def notify_new_review(*, review, exclude_user_id: UUID) -> None:
    try:
        recipients = subscriptions_excluding(exclude_user_id)
    except PushSubscriptionStoreError:
        logger.exception("Could not load push subscriptions for a new review")
        return

    for subscription in recipients:
        send_notification(
            subscription,
            title="Nueva reseña en Ñamii",
            body=f"{review.dish_name}: {review.text}"[:120],
            url=f"/reviews/{review.id}",
        )
