from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=256)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    refresh_token: str | None = Field(default=None, min_length=1, max_length=4096)


class MeResponse(BaseModel):
    username: str
    email: str | None = None
    name: str | None = None
    picture: str | None = None
    provider: str | None = None


class LogoutResponse(BaseModel):
    success: bool = True
