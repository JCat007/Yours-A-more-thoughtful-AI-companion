ALTER TABLE "bella_user_settings"
ADD COLUMN "agent_framework" TEXT NOT NULL DEFAULT 'openclaw',
ADD COLUMN "context_strategy_default" TEXT NOT NULL DEFAULT 'last_20_turns';
