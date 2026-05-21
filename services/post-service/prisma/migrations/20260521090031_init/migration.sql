-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostHashtag" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,

    CONSTRAINT "PostHashtag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Post_authorId_idx" ON "Post"("authorId");

-- CreateIndex
CREATE INDEX "Post_createdAt_idx" ON "Post"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "PostHashtag_postId_idx" ON "PostHashtag"("postId");

-- CreateIndex
CREATE INDEX "PostHashtag_tag_idx" ON "PostHashtag"("tag");

-- AddForeignKey
ALTER TABLE "PostHashtag" ADD CONSTRAINT "PostHashtag_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
