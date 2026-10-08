import { NextResponse, type NextRequest } from "next/server";

// Quick check only: send visitors without a session cookie to the login page.
// Every page and action still verifies the session itself.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("viochem_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/((?!login|_next|favicon.ico|api/health).*)"],
};
