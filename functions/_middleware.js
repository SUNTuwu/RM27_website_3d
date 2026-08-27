const SESSION_COOKIE = "ENTERPRIZE_PREVIEW";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const LOGIN_PATH = "/__enterprize-login";
const PUBLIC_PATHS = new Set(["/252478fc73dc3522687c788d2f12f490.txt"]);
const textEncoder = new TextEncoder();

const privateResponseHeaders = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function gatePage() {
  return new Response(`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ENTERPRIZE Preview</title>
<style>
:root{color-scheme:dark;font-family:ui-monospace,Consolas,monospace;background:#04060e;color:#e8edf7}
*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 80% 10%,#12313c 0,transparent 38%),#04060e}
main{width:min(100%,460px);padding:34px;border:1px solid #26576a;border-left:4px solid #46b8c8;border-radius:0 18px 18px 0;background:rgba(10,17,31,.9);box-shadow:0 20px 70px rgba(0,0,0,.4)}
.kicker{color:#7fd4e0;font-size:11px;letter-spacing:3px}h1{margin:18px 0 8px;font-size:28px;letter-spacing:2px}p{color:#8ea0c0;line-height:1.7;font-family:system-ui,sans-serif}label{display:block;margin-top:24px;color:#cdd8ec;font-size:13px}input{width:100%;margin-top:8px;padding:13px 14px;border:1px solid #315d6c;border-radius:8px;background:#070d19;color:#fff;font:16px ui-monospace,Consolas,monospace}button{width:100%;margin-top:16px;padding:13px;border:0;border-radius:999px;background:#46b8c8;color:#04121a;font:700 14px ui-monospace,Consolas,monospace;cursor:pointer}button:hover{filter:brightness(1.12)}
</style>
</head>
<body><main><div class="kicker">ENTERPRIZE // PRIVATE PREVIEW</div><h1>输入访问密码</h1><p>这是网站审核预览环境。请输入项目负责人提供的访问密码。</p><form method="post" action="${LOGIN_PATH}"><label for="password">访问密码</label><input id="password" name="password" type="password" autocomplete="current-password" required autofocus><button type="submit">进入预览</button></form></main></body>
</html>`, {
    status: 401,
    headers: {
      ...privateResponseHeaders,
      "Content-Type": "text/html; charset=UTF-8",
    },
  });
}

function unauthorized() {
  return new Response("Authentication required", {
    status: 401,
    headers: privateResponseHeaders,
  });
}

function base64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmacKey(secret, usages) {
  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

async function sign(value, secret) {
  const key = await hmacKey(secret, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(value));
  return base64Url(new Uint8Array(signature));
}

async function createSession(secret) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = String(expiresAt);
  return `${payload}.${await sign(payload, secret)}`;
}

async function hasValidSession(request, secret) {
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));

  if (!cookie || !secret) return false;

  const token = cookie.slice(`${SESSION_COOKIE}=`.length);
  const separator = token.lastIndexOf(".");
  if (separator < 1) return false;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expiresAt = Number(payload);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  try {
    const key = await hmacKey(secret, ["verify"]);
    return await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(signature),
      textEncoder.encode(payload),
    );
  } catch {
    return false;
  }
}

async function passwordsMatch(actualPassword, expectedPassword) {
  const actual = textEncoder.encode(actualPassword);
  const expected = textEncoder.encode(expectedPassword);
  if (actual.length !== expected.length) return false;

  const key = await hmacKey(expectedPassword, ["sign"]);
  const actualDigest = new Uint8Array(await crypto.subtle.sign("HMAC", key, actual));
  const expectedDigest = new Uint8Array(await crypto.subtle.sign("HMAC", key, expected));
  let mismatch = 0;
  for (let index = 0; index < actualDigest.length; index += 1) {
    mismatch |= actualDigest[index] ^ expectedDigest[index];
  }
  return mismatch === 0;
}

async function handleLogin(context) {
  const contentType = context.request.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return unauthorized();
  }

  const form = await context.request.formData();
  const password = form.get("password");
  if (typeof password !== "string" || !context.env.SITE_PASSWORD) {
    return unauthorized();
  }

  if (!await passwordsMatch(password, context.env.SITE_PASSWORD)) {
    return unauthorized();
  }

  const session = await createSession(context.env.SITE_PASSWORD);
  return new Response(null, {
    status: 303,
    headers: {
      Location: "/",
      ...privateResponseHeaders,
      "Set-Cookie": `${SESSION_COOKIE}=${session}; Max-Age=${SESSION_TTL_SECONDS}; Path=/; Secure; HttpOnly; SameSite=Strict`,
    },
  });
}

export async function onRequest(context) {
  const pathname = new URL(context.request.url).pathname;

  if (PUBLIC_PATHS.has(pathname)) {
    return context.next();
  }

  if (context.request.method === "POST" && pathname === LOGIN_PATH) {
    return handleLogin(context);
  }

  if (await hasValidSession(context.request, context.env.SITE_PASSWORD)) {
    return context.next();
  }

  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return unauthorized();
  }

  return gatePage();
}
