-- Copies the cost of every question asked before ask_spend existed (0019),
-- so this month's budget still counts what was already spent. New questions
-- add their own row (src/lib/ask-store.ts). Only the cost and the date are
-- copied: ask_spend keeps no account, question or answer.
INSERT INTO "ask_spend" ("cost_micros", "created_at")
SELECT "cost_micros", "created_at" FROM "ask_questions";
