-- Migration 002: Add archived_at to jobs table.
ALTER TABLE jobs ADD COLUMN archived_at TEXT;
