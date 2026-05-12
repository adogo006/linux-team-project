from datetime import datetime, timezone, timedelta
from jose import jwt, JWTError
from jose import ExpiredSignatureError
from fastapi import HTTPException
import os

SECRET_KEY = os.getenv("SECRET_KEY", "temporary-secret-key")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

# In-memory blacklist for revoked tokens (logout)
expired_tokens: set = set()


def get_token_from_header(authorization_header: str | None) -> str:
    """Extract bearer token string from `Authorization` header value.

    Returns the token string or raises HTTPException(401) when header is missing/invalid.
    """
    if not authorization_header:
        raise HTTPException(status_code=401, detail="Authorization header missing")

    parts = authorization_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header format")

    return parts[1]
def verify_access_token(token: str) -> dict:
    """Verify JWT and check blacklist. Returns payload dict or raises HTTPException.

    Raises HTTPException(status_code=401) on any failure.
    """
    if token in expired_tokens:
        raise HTTPException(status_code=401, detail="Token has been revoked")

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


def add_expired_token(token: str) -> None:
    """Mark a token as expired/revoked so it cannot be used again."""
    expired_tokens.add(token)

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt