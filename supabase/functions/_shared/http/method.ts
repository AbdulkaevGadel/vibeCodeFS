export function requirePost(request: Request): Response | null {
  if (request.method === "POST") {
    return null
  }

  return new Response("Method Not Allowed", { status: 405 })
}

