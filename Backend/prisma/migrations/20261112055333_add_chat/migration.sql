-- Percakapan LiveChat Akulaku dengan buyer.
CREATE TABLE "ChatConversation" (
    "id" BIGSERIAL NOT NULL,
    "accountId" BIGINT NOT NULL,
    "convKey" VARCHAR(255) NOT NULL,
    "buyerLabel" VARCHAR(150) NOT NULL,
    "lastPreview" VARCHAR(500),
    "lastMessageAt" TIMESTAMPTZ,
    "unread" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatConversation_accountId_convKey_key" ON "ChatConversation"("accountId", "convKey");
CREATE INDEX "ChatConversation_accountId_idx" ON "ChatConversation"("accountId");
CREATE INDEX "ChatConversation_lastMessageAt_idx" ON "ChatConversation"("lastMessageAt");

ALTER TABLE "ChatConversation"
  ADD CONSTRAINT "ChatConversation_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "AkulakuAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Pesan dalam percakapan LiveChat.
CREATE TABLE "ChatMessage" (
    "id" BIGSERIAL NOT NULL,
    "conversationId" BIGINT NOT NULL,
    "msgKey" VARCHAR(200) NOT NULL,
    "from" VARCHAR(10) NOT NULL,
    "sender" VARCHAR(150),
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatMessage_conversationId_msgKey_key" ON "ChatMessage"("conversationId", "msgKey");
CREATE INDEX "ChatMessage_conversationId_idx" ON "ChatMessage"("conversationId");

ALTER TABLE "ChatMessage"
  ADD CONSTRAINT "ChatMessage_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
