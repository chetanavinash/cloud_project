import { PrismaClient as UserPrismaClient } from '../generated/user-client/index.js';
import { PrismaClient as PostPrismaClient } from '../generated/post-client/index.js';
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
