import assert from "node:assert/strict";
import test from "node:test";
import { onRequest } from "./_middleware.js";

const origin = "https://test.hkustenterprize.win";

function createContext(request, env = {}, next = () => new Response("next")) {
  return { request, env, next };
}

test("public verification file bypasses the password gate", async () => {
  let passedThrough = false;
  const request = new Request(`${origin}/252478fc73dc3522687c788d2f12f490.txt`);
  const response = await onRequest(createContext(request, {}, () => {
    passedThrough = true;
    return new Response("verification-token");
  }));

  assert.equal(passedThrough, true);
  assert.equal(response.status, 200);
});

test("anonymous navigation receives the password-only gate", async () => {
  const response = await onRequest(createContext(new Request(`${origin}/`)));
  const html = await response.text();

  assert.equal(response.status, 401);
  assert.match(html, /name="password"/);
  assert.doesNotMatch(html, /name="username"/);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("X-Frame-Options"), "DENY");
});

test("invalid password is rejected without setting a session", async () => {
  const request = new Request(`${origin}/__enterprize-login`, {
    method: "POST",
    body: new URLSearchParams({ password: "incorrect" }),
  });
  const response = await onRequest(createContext(request, { SITE_PASSWORD: "correct!!" }));

  assert.equal(response.status, 401);
  assert.equal(response.headers.get("Set-Cookie"), null);
});

test("valid password creates a session that authorizes later requests", async () => {
  const secret = "deployment-test-secret";
  const loginRequest = new Request(`${origin}/__enterprize-login`, {
    method: "POST",
    body: new URLSearchParams({ password: secret }),
  });
  const loginResponse = await onRequest(createContext(loginRequest, { SITE_PASSWORD: secret }));

  assert.equal(loginResponse.status, 303);
  const setCookie = loginResponse.headers.get("Set-Cookie");
  assert.match(setCookie, /Secure; HttpOnly; SameSite=Strict/);

  const cookie = setCookie.split(";", 1)[0];
  let passedThrough = false;
  const pageRequest = new Request(`${origin}/`, { headers: { Cookie: cookie } });
  const pageResponse = await onRequest(createContext(
    pageRequest,
    { SITE_PASSWORD: secret },
    () => {
      passedThrough = true;
      return new Response("protected site");
    },
  ));

  assert.equal(passedThrough, true);
  assert.equal(pageResponse.status, 200);
  assert.equal(await pageResponse.text(), "protected site");
});
