import { PrismaClient as UserPrismaClient } from '@prisma/user-client';
import { PrismaClient as PostPrismaClient } from '@prisma/post-client';
import { config } from './index.js';

export const userPrisma = new UserPrismaClient({
  datasources: {
    db: {
      url: config.USER_DATABASE_URL,
    },
  },
});

export const postPrisma = new PostPrismaClient({
  datasources: {
    db: {
      url: config.POST_DATABASE_URL,
    },
  },
});
