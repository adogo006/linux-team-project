import os
import time

from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from db_manager.db_handler import Base, engine
from db_manager import models  # noqa: F401  # Ensure all models are registered on Base


def wait_for_db(max_retries: int = 20, delay_seconds: int = 2) -> None:
    for attempt in range(1, max_retries + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            print("Database connection is ready.")
            return
        except OperationalError as exc:
            print(f"DB not ready ({attempt}/{max_retries}): {exc}")
            if attempt == max_retries:
                raise
            time.sleep(delay_seconds)


def main() -> None:
    retries = int(os.getenv("DB_INIT_RETRIES", "20"))
    delay = int(os.getenv("DB_INIT_DELAY", "2"))

    wait_for_db(max_retries=retries, delay_seconds=delay)
    Base.metadata.create_all(bind=engine)
    print("Database tables created successfully.")


if __name__ == "__main__":
    main()
