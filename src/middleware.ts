import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/gate') ||
    // Only /api/auth and /api/gong/ are excluded — they use X-Gong-Auth or set the cookie themselves
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/gong/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  const auth = request.cookies.get('gw-auth');
  if (auth?.value === '1') {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = '/gate';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
