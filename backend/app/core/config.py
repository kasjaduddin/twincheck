"""
Application configuration loaded from environment variables.

All secrets come from environment — never hardcoded.
For local development, create a .env file at backend/.env.
For Railway deployment, set these as environment variables in the dashboard.

Fields marked as required (no default):
    - DATABASE_URL  — needed from day 1
    - JWT_SECRET    — needed from day 1

All other fields have empty string defaults and are filled in
as each phase is implemented.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # --- Database (required from day 1) ---
    # Direct: postgresql+asyncpg://postgres:[pw]@db.[ref].supabase.co:5432/postgres?ssl=require
    database_url: str

    # --- Auth (required from day 1) ---
    # Generate with: python -c "import secrets; print(secrets.token_hex(32))"
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    # 7 days in seconds — matches FR-MR-01.6
    jwt_expiry_seconds: int = 60 * 60 * 24 * 7

    # --- Supabase Storage (required at Phase 5 — evidence upload) ---
    supabase_url: str = ""
    supabase_service_key: str = ""  # service role key — never expose to client

    # --- AI Services (required at Phase 3 — STT + NLP) ---
    gemini_api_key: str = ""

    # --- RunPod (required at Phase 6 — GS pipeline) ---
    runpod_api_key: str = ""
    runpod_endpoint_id: str = ""
    runpod_callback_secret: str = ""

    # --- App ---
    environment: str = "development"
    cors_origins: list[str] = ["http://localhost:5173", "https://twincheck.demo"]


settings = Settings()  # type: ignore[call-arg]
