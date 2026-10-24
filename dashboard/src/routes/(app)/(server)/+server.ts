import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** The Services page is the landing page; every user can see it. */
export const GET: RequestHandler = () => redirect(307, '/services');
