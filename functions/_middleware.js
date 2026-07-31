const USERNAME = 'enterprize'
const REALM = 'ENTERPRIZE RM2027 Preview'

function unauthorized() {
  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}"`,
      'Cache-Control': 'no-store',
    },
  })
}

function decodeCredentials(header) {
  if (!header?.startsWith('Basic ')) {
    return null
  }

  try {
    const decoded = atob(header.slice(6))
    const separator = decoded.indexOf(':')

    if (separator < 0) {
      return null
    }

    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    }
  } catch {
    return null
  }
}

function hasMatchingSecret(actual, expected) {
  if (!expected || actual.length !== expected.length) {
    return false
  }

  const actualBytes = new TextEncoder().encode(actual)
  const expectedBytes = new TextEncoder().encode(expected)

  return crypto.subtle.timingSafeEqual(actualBytes, expectedBytes)
}

export async function onRequest(context) {
  const credentials = decodeCredentials(
    context.request.headers.get('Authorization'),
  )

  if (
    !credentials ||
    credentials.username !== USERNAME ||
    !hasMatchingSecret(credentials.password, context.env.SITE_PASSWORD)
  ) {
    return unauthorized()
  }

  return context.next()
}
