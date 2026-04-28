import { getInternalSecret, getSupabaseServiceRoleKey, getSupabaseUrl } from "./env.ts"

type InvokeAiOrchestratorParams = {
  chatId: string
  triggerMessageId: string
  correlationId: string
}

export async function invokeAiOrchestrator({
  chatId,
  triggerMessageId,
  correlationId,
}: InvokeAiOrchestratorParams): Promise<boolean> {
  const supabaseUrl = getSupabaseUrl()
  const internalSecret = getInternalSecret()
  const serviceRoleKey = getSupabaseServiceRoleKey()

  if (!supabaseUrl || !internalSecret || !serviceRoleKey) {
    console.error("AI orchestrator env is not configured")
    return false
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/ai-orchestrator`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "x-internal-secret": internalSecret,
    },
    body: JSON.stringify({
      chat_id: chatId,
      trigger_message_id: triggerMessageId,
      correlation_id: correlationId,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`AI orchestrator invoke failed ${response.status}: ${errorText}`)
    return false
  }

  const resultText = await response.text()
  console.log(`AI orchestrator invoke response ${response.status}: ${resultText}`)
  return true
}
