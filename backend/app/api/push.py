from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.api.dependencies import get_current_session, require_trusted_origin
from app.core.config import settings
from app.schemas.push import (
    PushSubscriptionDeleteRequest,
    PushSubscriptionRequest,
    VapidPublicKeyResponse,
)
from app.services import push as push_service
from app.services.auth import AuthenticatedSession

router = APIRouter(prefix="/push", tags=["push"])


@router.get("/vapid-public-key", response_model=VapidPublicKeyResponse)
def vapid_public_key(
    session: Annotated[AuthenticatedSession, Depends(get_current_session)],
) -> VapidPublicKeyResponse:
    if not settings.vapid_public_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Web Push is not configured",
        )
    return VapidPublicKeyResponse(public_key=settings.vapid_public_key)


@router.post(
    "/subscriptions",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_trusted_origin)],
)
def create_subscription(
    body: PushSubscriptionRequest,
    session: Annotated[AuthenticatedSession, Depends(get_current_session)],
) -> Response:
    try:
        push_service.upsert_subscription(
            user_id=session.user_id,
            endpoint=body.endpoint,
            p256dh=body.keys.p256dh,
            auth=body.keys.auth,
        )
    except push_service.PushSubscriptionStoreError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Push service unavailable",
        ) from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/subscriptions",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_trusted_origin)],
)
def remove_subscription(
    body: PushSubscriptionDeleteRequest,
    session: Annotated[AuthenticatedSession, Depends(get_current_session)],
) -> Response:
    try:
        push_service.delete_subscription(user_id=session.user_id, endpoint=body.endpoint)
    except push_service.PushSubscriptionStoreError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Push service unavailable",
        ) from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)
