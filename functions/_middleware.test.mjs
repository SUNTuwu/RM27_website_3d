import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./_middleware.js', import.meta.url), 'utf8')

assert.match(source, /name="password"/)
assert.match(source, /name="SITE_PASSWORD"|context\.env\.SITE_PASSWORD/)
assert.match(source, /HttpOnly; SameSite=Strict/)
assert.match(source, /SESSION_TTL_SECONDS/)
assert.match(source, /PUBLIC_PATHS/)
assert.match(source, /252478fc73dc3522687c788d2f12f490\.txt/)
assert.doesNotMatch(source, /WWW-Authenticate/)
assert.doesNotMatch(source, /const USERNAME/)

console.log('password-only middleware contract passed')
