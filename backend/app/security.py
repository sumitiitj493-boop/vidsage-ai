import base64
import hashlib
import hmac
import os
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from jose import JWTError, jwt

from app.config import settings

ALGORITHM = "HS256"
ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"


class AuthRateLimiter:
    def __init__(self, max_attempts: int, window_seconds: int):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._attempts: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def is_limited(self, key: str) -> bool:
        now = time.time()
        with self._lock:
            window_start = now - self.window_seconds
            hits = [ts for ts in self._attempts.get(key, []) if ts >= window_start]
            self._attempts[key] = hits
            return len(hits) >= self.max_attempts

    def register_failure(self, key: str) -> None:
        now = time.time()
        with self._lock:
            self._attempts.setdefault(key, []).append(now)

    def clear(self, key: str) -> None:
        with self._lock:
            self._attempts.pop(key, None)


auth_rate_limiter = AuthRateLimiter(
    max_attempts=max(1, settings.AUTH_MAX_LOGIN_ATTEMPTS),
    window_seconds=max(30, settings.AUTH_LOGIN_WINDOW_SECONDS),
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _build_token_claims(sub: str, token_type: str, expire_delta: timedelta) -> Dict[str, Any]:
    now = _utc_now()
    return {
        "sub": sub,
        "type": token_type,
        "iss": settings.AUTH_ISSUER,
        "aud": settings.AUTH_AUDIENCE,
        "iat": now,
        "nbf": now,
        "exp": now + expire_delta,
        "jti": uuid.uuid4().hex,
    }


def _constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def _pbkdf2_sha256_hash(password: str, salt: bytes, iterations: int) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)


def _verify_pbkdf2_password(password: str, encoded_hash: str) -> bool:
    # Format: pbkdf2_sha256$<iterations>$<salt_b64>$<hash_b64>
    try:
        algo, iter_text, salt_b64, digest_b64 = encoded_hash.split("$")
        if algo != "pbkdf2_sha256":
            return False
        iterations = int(iter_text)
        if iterations < 100_000:
            return False
        salt = base64.urlsafe_b64decode(salt_b64.encode("ascii"))
        expected = base64.urlsafe_b64decode(digest_b64.encode("ascii"))
    except Exception:
        return False

    computed = _pbkdf2_sha256_hash(password, salt, iterations)
    return hmac.compare_digest(computed, expected)


def verify_login_credentials(username: str, password: str) -> bool:
    username_ok = _constant_time_equals(username, settings.AUTH_USERNAME)
    if not username_ok:
        return False

    password_hash = settings.AUTH_PASSWORD_HASH.strip()
    if password_hash:
        return _verify_pbkdf2_password(password, password_hash)

    return _constant_time_equals(password, settings.AUTH_PASSWORD)


def create_access_token(data: Dict[str, Any], expire_minutes: Optional[int] = None) -> str:
    subject = str(data.get("sub", "")).strip()
    if not subject:
        raise ValueError("Token subject is required")

    lifetime_minutes = expire_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES
    claims = _build_token_claims(
        sub=subject,
        token_type=ACCESS_TOKEN_TYPE,
        expire_delta=timedelta(minutes=lifetime_minutes),
    )

    for key, value in data.items():
        if key not in {"sub", "type", "iss", "aud", "iat", "nbf", "exp", "jti"}:
            claims[key] = value

    return jwt.encode(claims, settings.AUTH_SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(sub: str) -> str:
    subject = sub.strip()
    if not subject:
        raise ValueError("Refresh token subject is required")

    claims = _build_token_claims(
        sub=subject,
        token_type=REFRESH_TOKEN_TYPE,
        expire_delta=timedelta(days=settings.AUTH_REFRESH_TOKEN_EXPIRE_DAYS),
    )
    return jwt.encode(claims, settings.AUTH_SECRET_KEY, algorithm=ALGORITHM)


def verify_access_token(token: str) -> Optional[Dict[str, Any]]:
    return verify_token(token=token, expected_type=ACCESS_TOKEN_TYPE)


def verify_refresh_token(token: str) -> Optional[Dict[str, Any]]:
    return verify_token(token=token, expected_type=REFRESH_TOKEN_TYPE)


def verify_token(token: str, expected_type: str) -> Optional[Dict[str, Any]]:
    try:
        payload = jwt.decode(
            token,
            settings.AUTH_SECRET_KEY,
            algorithms=[ALGORITHM],
            audience=settings.AUTH_AUDIENCE,
            issuer=settings.AUTH_ISSUER,
            options={"leeway": settings.AUTH_TOKEN_LEEWAY_SECONDS},
        )
        sub = payload.get("sub")
        token_type = payload.get("type")
        if not isinstance(sub, str) or not sub.strip():
            return None
        if token_type != expected_type:
            return None
        return payload
    except JWTError:
        return None


def build_pbkdf2_password_hash(password: str, iterations: int = 300_000) -> str:
    if iterations < 100_000:
        raise ValueError("iterations must be >= 100000")
    salt = os.urandom(16)
    digest = _pbkdf2_sha256_hash(password=password, salt=salt, iterations=iterations)
    salt_b64 = base64.urlsafe_b64encode(salt).decode("ascii")
    digest_b64 = base64.urlsafe_b64encode(digest).decode("ascii")
    return f"pbkdf2_sha256${iterations}${salt_b64}${digest_b64}"
