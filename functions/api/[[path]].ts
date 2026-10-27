import { handleRequest } from '../../server/router';
import type { Env } from '../../server/env';

export const onRequest: PagesFunction<Env> = context => handleRequest(context.request, context.env);
