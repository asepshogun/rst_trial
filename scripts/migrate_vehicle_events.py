import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy import text
from app.database import engine

def run_migration():
    print("Starting migration on vehicle_events table...")
    with engine.connect() as conn:
        result = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='vehicle_events'"))
        existing_columns = [row[0] for row in result]
        
        columns_to_add = {
            "site_code": "VARCHAR(50)",
            "site_name": "VARCHAR(255)",
            "location_description": "TEXT",
            "latitude": "DOUBLE PRECISION",
            "longitude": "DOUBLE PRECISION",
            "recorded_at": "TIMESTAMP WITH TIME ZONE",
            "video_filename": "TEXT"
        }
        
        for col, col_type in columns_to_add.items():
            if col not in existing_columns:
                print(f"Adding column {col} ({col_type})...")
                conn.execute(text(f"ALTER TABLE vehicle_events ADD COLUMN {col} {col_type}"))
            else:
                print(f"Column {col} already exists, skipping.")
        
        conn.commit()
    print("Migration completed successfully.")

if __name__ == "__main__":
    run_migration()
