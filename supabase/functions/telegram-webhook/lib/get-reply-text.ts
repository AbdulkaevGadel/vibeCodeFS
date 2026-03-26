export function getReplyText(messageText: string) {
  const normalizedText = messageText.trim()

  if (!normalizedText) {
    return "I got your message."
  }

  return `I got your message: "${normalizedText}". I hear you.`
}
