-- CreateTable
CREATE TABLE "SearchUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "bio" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchPost" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchHashtag" (
    "tag" TEXT NOT NULL,
    "postCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchHashtag_pkey" PRIMARY KEY ("tag")
);

-- CreateIndex
CREATE INDEX "SearchUser_username_idx" ON "SearchUser"("username");

-- CreateIndex
CREATE INDEX "SearchPost_authorId_idx" ON "SearchPost"("authorId");

-- CreateIndex
CREATE INDEX "SearchPost_createdAt_idx" ON "SearchPost"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "SearchHashtag_postCount_idx" ON "SearchHashtag"("postCount" DESC);
