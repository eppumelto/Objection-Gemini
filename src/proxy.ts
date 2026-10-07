import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default function proxy(request: NextRequest) {
  const session = request.cookies.get('session');
  const path = request.nextUrl.pathname;

  // Root redirects to /cases
  if (path === '/') {
    return NextResponse.redirect(new URL('/cases', request.url));
  }

  // Public routes
  if (path === '/login' || path === '/register') {
    if (session) {
      return NextResponse.redirect(new URL('/cases', request.url));
    }
    return NextResponse.next();
  }

  // Protected routes
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
