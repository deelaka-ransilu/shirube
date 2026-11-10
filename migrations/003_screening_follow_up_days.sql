-- Migration 003: Screening follow-up is counted from the latest reply, default 7 days.
INSERT OR IGNORE INTO settings (key, value) VALUES ('screening_follow_up_days', '7');
