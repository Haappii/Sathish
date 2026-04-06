#!/usr/bin/env python3
"""
Migration runner script to execute SQL migration files
"""
import os
import psycopg2
from psycopg2 import sql

def run_migrations():
    # Get database URL
    db_url = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/shop_billing"
    )
    
    # Parse connection string
    try:
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor()
        
        # Read and execute migration file
        migration_path = os.path.join(os.path.dirname(__file__), "migrations", "20260406_add_table_categories.sql")
        
        with open(migration_path, 'r') as f:
            migration_sql = f.read()
        
        cursor.execute(migration_sql)
        conn.commit()
        
        print("✓ Migration executed successfully")
        
        cursor.close()
        conn.close()
        
    except psycopg2.Error as e:
        print(f"✗ Database error: {e}")
        if conn:
            conn.rollback()
            conn.close()
        return False
    except Exception as e:
        print(f"✗ Error: {e}")
        return False
    
    return True

if __name__ == "__main__":
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    
    success = run_migrations()
    sys.exit(0 if success else 1)
