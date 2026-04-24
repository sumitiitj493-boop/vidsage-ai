from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.api.deps import require_auth
from app.config import settings
from app.models.auth_models import LoginRequest, LogoutResponse, MeResponse, RefreshRequest, TokenResponse
from app.security import (
    auth_rate_limiter,
    create_access_token,
    create_refresh_token,
    verify_login_credentials,
    verify_refresh_token,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    access_max_age = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    refresh_max_age = settings.AUTH_REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
    same_site = settings.AUTH_COOKIE_SAMESITE if settings.AUTH_COOKIE_SAMESITE in {"lax", "strict", "none"} else "lax"

    response.set_cookie(
        key=settings.AUTH_ACCESS_COOKIE_NAME,
        value=access_token,
        max_age=access_max_age,
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=same_site,
        path="/",
    )
    response.set_cookie(
        key=settings.AUTH_REFRESH_COOKIE_NAME,
        value=refresh_token,
        max_age=refresh_max_age,
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=same_site,
        path="/api/auth",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(key=settings.AUTH_ACCESS_COOKIE_NAME, path="/")
    response.delete_cookie(key=settings.AUTH_REFRESH_COOKIE_NAME, path="/api/auth")


def _build_token_response(username: str, response: Response) -> TokenResponse:
    access_token = create_access_token(
        {"sub": username},
        expire_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
    )
    refresh_token = create_refresh_token(username)
    _set_auth_cookies(response=response, access_token=access_token, refresh_token=refresh_token)

    return TokenResponse(
        access_token=access_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


def _rate_limit_key(request: Request, username: str) -> str:
    client_host = request.client.host if request.client else "unknown"
    return f"{client_host}:{username.lower().strip()}"


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, response: Response):
    rate_key = _rate_limit_key(request=request, username=payload.username)
    if auth_rate_limiter.is_limited(rate_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Try again later.",
        )

    is_valid = verify_login_credentials(username=payload.username, password=payload.password)
    if not is_valid:
        auth_rate_limiter.register_failure(rate_key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    auth_rate_limiter.clear(rate_key)
    return _build_token_response(username=payload.username, response=response)


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(response: Response, request: Request, body: RefreshRequest | None = None):
    refresh_token_value = request.cookies.get(settings.AUTH_REFRESH_COOKIE_NAME)
    if not refresh_token_value and body and body.refresh_token:
        refresh_token_value = body.refresh_token

    if not refresh_token_value:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing",
        )

    payload = verify_refresh_token(refresh_token_value)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token invalid or expired",
        )

    username = str(payload.get("sub", "")).strip()
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token invalid",
        )

    return _build_token_response(username=username, response=response)


@router.post("/logout", response_model=LogoutResponse)
def logout(response: Response):
    _clear_auth_cookies(response)
    return LogoutResponse()


@router.get("/me", response_model=MeResponse)
def me(current_user: dict = Depends(require_auth)):
    return MeResponse(username=current_user.get("sub", "unknown"))
