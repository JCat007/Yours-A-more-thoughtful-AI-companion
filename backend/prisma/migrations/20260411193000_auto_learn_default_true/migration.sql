-- Default auto-learn on for new settings rows (does not change existing values).
ALTER TABLE "bella_user_settings" ALTER COLUMN "auto_learn_enabled" SET DEFAULT true;
