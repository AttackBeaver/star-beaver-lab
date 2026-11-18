-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateTable
CREATE TABLE "Meme" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(200),
    "description" VARCHAR(2000),
    "filePath" VARCHAR(500) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "mediaType" "MediaType" NOT NULL,
    "posterPath" VARCHAR(500),
    "authorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" INTEGER,

    CONSTRAINT "Meme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemeLike" (
    "id" SERIAL NOT NULL,
    "memeId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemeLike_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Meme_authorId_idx" ON "Meme"("authorId");

-- CreateIndex
CREATE INDEX "Meme_deletedAt_idx" ON "Meme"("deletedAt");

-- CreateIndex
CREATE INDEX "Meme_createdAt_idx" ON "Meme"("createdAt");

-- CreateIndex
CREATE INDEX "Meme_deletedAt_createdAt_idx" ON "Meme"("deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "MemeLike_memeId_idx" ON "MemeLike"("memeId");

-- CreateIndex
CREATE INDEX "MemeLike_userId_idx" ON "MemeLike"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MemeLike_memeId_userId_key" ON "MemeLike"("memeId", "userId");

-- AddForeignKey
ALTER TABLE "Meme" ADD CONSTRAINT "Meme_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meme" ADD CONSTRAINT "Meme_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemeLike" ADD CONSTRAINT "MemeLike_memeId_fkey" FOREIGN KEY ("memeId") REFERENCES "Meme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemeLike" ADD CONSTRAINT "MemeLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
