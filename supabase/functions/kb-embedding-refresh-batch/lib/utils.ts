export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error"
}

export function requireString(value: unknown, name: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} is required`)
  }

  return value
}

export function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
