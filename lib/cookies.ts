export function parseCookies(
  cookieHeader: string | undefined,
): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!cookieHeader) return cookies;
  for (const cookie of cookieHeader.split(";")) {
    const [name, ...rest] = cookie.trim().split("=");
    if (name && rest.length > 0) {
      cookies.set(name, rest.join("="));
    }
  }
  return cookies;
}
