-- Bella app tables (separate naming from gbrain's own tables).
CREATE TABLE "bella_users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bella_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bella_users_username_key" ON "bella_users"("username");

CREATE TABLE "bella_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bella_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bella_sessions_token_hash_idx" ON "bella_sessions"("token_hash");

CREATE TABLE "bella_user_settings" (
    "user_id" TEXT NOT NULL,
    "companion_memory_enabled" BOOLEAN NOT NULL DEFAULT false,
    "auto_learn_enabled" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "bella_user_settings_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "bella_sessions" ADD CONSTRAINT "bella_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "bella_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bella_user_settings" ADD CONSTRAINT "bella_user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "bella_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
