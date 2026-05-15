import { next } from "@vercel/functions";

import { SESSION_COOKIE_NAME, verifySessionValue } from "./lib/session.mjs";

export default async function middleware(request) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    return new Response("Session secret is not configured", { status: 500 });
  }

  const url = new URL(request.url);
  const cookieHeader = request.headers.get("cookie") || "";
  const sessionValue = readCookie(cookieHeader, SESSION_COOKIE_NAME);
  const payload = await verifySessionValue(sessionValue, secret);

  const isAdminRoute = url.pathname === "/admin.html";

  if (isAdminRoute) {
    if (payload?.isAdmin) return next();
    return Response.redirect(new URL("/", url), 307);
  }

  // Games routes — any valid session
  if (payload) {
    return next();
  }

  const acceptHeader = request.headers.get("accept") || "";
  if (acceptHeader.includes("text/html")) {
    return Response.redirect(new URL("/", url), 307);
  }

  return new Response("Forbidden", { status: 403 });
}

function readCookie(cookieHeader, name) {
  const prefix = `${name}=`;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length);
    }
  }

  return "";
}

export const config = {
  matcher: ["/admin.html", "/games/:path*"],
};
