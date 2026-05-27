"""
VidSage — Request Logging Middleware

Structured request/response logging for production:
- Request ID tracking
- Response time measurement
- User/IP tracking
- Error context logging
"""

import logging
import time
import uuid
from contextvars import ContextVar

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

logger = logging.getLogger("vidsage.access")

# Context variable for request ID (can be used in any handler)
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        req_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request_id_ctx.set(req_id)

        start_time = time.time()

        # Log incoming request
        client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "unknown")
        logger.info(
            f"[{req_id}] → {request.method} {request.url.path} "
            f"ip={client_ip} "
            f"ua={request.headers.get('User-Agent', 'unknown')[:80]}"
        )

        try:
            response = await call_next(request)
        except Exception as e:
            duration = time.time() - start_time
            logger.error(
                f"[{req_id}] ✗ {request.method} {request.url.path} "
                f"status=500 duration={duration:.3f}s error={str(e)}"
            )
            raise

        duration = time.time() - start_time

        # Log response
        level = logging.WARNING if response.status_code >= 400 else logging.INFO
        logger.log(
            level,
            f"[{req_id}] ← {request.method} {request.url.path} "
            f"status={response.status_code} duration={duration:.3f}s"
        )

        # Add request ID to response headers
        response.headers["X-Request-ID"] = req_id
        response.headers["X-Response-Time"] = f"{duration:.3f}s"

        return response