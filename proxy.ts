import { NextResponse, type NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  const hasToken = Boolean(req.cookies.get("aicaller_token")?.value);
  const path = req.nextUrl.pathname;
  if (path === "/login") {
    if (hasToken) return NextResponse.redirect(new URL("/", req.url));
    return NextResponse.next();
  }
  if (!hasToken) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
