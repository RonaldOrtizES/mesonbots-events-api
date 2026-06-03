CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_open_conversation
ON conversations (tenant_id, customer_phone)
WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
ON messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_webhooks_log_processed
ON webhooks_log (processed, received_at)
WHERE processed = false;
