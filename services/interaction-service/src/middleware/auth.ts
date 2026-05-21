import { FastifyRequest, FastifyReply } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config/index.js';

let jwksUri = '';
let JWKS: ReturnType<typeof createRemoteJWKSet> | null = null;

if (config.COGNITO_USER_POOL_ID) {
  const issuer = config.USE_LOCALSTACK === 'true'
    ? `${config.LOCALSTACK_ENDPOINT}/us-east-1_${config.COGNITO_USER_POOL_ID}`
    : `https://cognito-idp.${config.AWS_REGION}.amazonaws.com/${config.COGNITO_USER_POOL_ID}`;
  
  jwksUri = `${issuer}/.well-known/jwks.json`;
  JWKS = createRemoteJWKSet(new URL(jwksUri));
}

export interface AuthenticatedUser {
  sub: string;
  email?: string;
  username?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

export async function verifyJWT(request: FastifyRequest, reply: FastifyReply) {
  // Support mock bypass in development/test if x-mock-user-id header is provided
  if ((config.NODE_ENV === 'development' || config.NODE_ENV === 'test') && request.headers['x-mock-user-id']) {
    request.user = {
      sub: request.headers['x-mock-user-id'] as string,
      email: (request.headers['x-mock-email'] as string) || 'mockuser@example.com',
      username: (request.headers['x-mock-username'] as string) || 'mockuser',
    };
    return;
  }

  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'Unauthorized: Missing or invalid token' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    if ((config.NODE_ENV === 'development' || config.NODE_ENV === 'test') && !config.COGNITO_USER_POOL_ID) {
      // Decode JWT without signature verification if Cognito is not set up yet in development/test
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        request.user = {
          sub: payload.sub || payload.id || 'mock-id',
          email: payload.email,
          username: payload['cognito:username'] || payload.username,
        };
        return;
      }
    }

    if (!JWKS) {
      reply.status(500).send({ error: 'Auth service misconfigured: Cognito Pool ID missing' });
      return;
    }

    const issuer = config.USE_LOCALSTACK === 'true'
      ? `${config.LOCALSTACK_ENDPOINT}/us-east-1_${config.COGNITO_USER_POOL_ID}`
      : `https://cognito-idp.${config.AWS_REGION}.amazonaws.com/${config.COGNITO_USER_POOL_ID}`;

    const { payload } = await jwtVerify(token, JWKS, {
      issuer,
    });

    request.user = {
      sub: payload.sub as string,
      email: payload.email as string,
      username: (payload['cognito:username'] || payload.username) as string,
    };
  } catch (error) {
    request.log.error(error);
    reply.status(401).send({ error: 'Unauthorized: Invalid token signature or claims' });
  }
}
