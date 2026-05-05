import type {TelegramUpdate} from "./types/telegram.ts"
import {createSuccessResponse} from "./lib/create-success-response.ts";
import {getBotUsername} from "./lib/get-bot-username.ts";
import {parseUpdate} from "./lib/parse-update.ts";
import {getBotToken} from "./lib/env.ts";
import {canPersistMessage, canReplyToMessage} from "./lib/validate-message.ts";
import {saveIncomingMessage} from "./lib/save-incoming-message.ts";
import {invokeAiOrchestrator} from "./lib/invoke-ai-orchestrator.ts";

Deno.serve(async (request) => {
    if (request.method !== "POST") {
        return new Response("Method Not Allowed", {
            status: 405,
            headers: {
                Allow: "POST",
            },
        })
    }

    try {
        const botToken = getBotToken()

        if (!botToken) {
            console.error("BOT_TOKEN is not configured")
            return createSuccessResponse()
        }

        const update = (await request.json()) as TelegramUpdate
        const {message, chatId, messageText} = parseUpdate(update)

        console.log("Incoming Telegram update:", JSON.stringify(update))

        if (!canReplyToMessage(message) || !chatId) {
            console.error("Missing chat id in Telegram update")
            return createSuccessResponse()
        }

        if (canPersistMessage(message)) {
            const botUsername = await getBotUsername(botToken)
            const saveResult = await saveIncomingMessage(message, botUsername)

            if (saveResult?.inserted && saveResult.messageId) {
                const correlationId = crypto.randomUUID()

                console.log("AI orchestrator invoke scheduled:", JSON.stringify({
                    chat_id: saveResult.chatId,
                    trigger_message_id: saveResult.messageId,
                    correlation_id: correlationId,
                }))

                EdgeRuntime.waitUntil(
                    invokeAiOrchestrator({
                        chatId: saveResult.chatId,
                        triggerMessageId: saveResult.messageId,
                        correlationId,
                    }).then((orchestratorInvoked) => {
                        if (orchestratorInvoked) {
                            console.log("AI orchestrator background invoke finished:", JSON.stringify({
                                trigger_message_id: saveResult.messageId,
                                correlation_id: correlationId,
                            }))
                            return
                        }

                        console.error("AI orchestrator background invoke did not finish successfully:", JSON.stringify({
                            trigger_message_id: saveResult.messageId,
                            correlation_id: correlationId,
                        }))
                    }).catch((error) => {
                        console.error("AI orchestrator best-effort background invoke error:", error)
                    }),
                )
            } else {
                console.log("AI orchestrator invoke skipped:", JSON.stringify({
                    inserted: saveResult?.inserted ?? null,
                    is_duplicate: saveResult?.isDuplicate ?? null,
                    message_id: saveResult?.messageId ?? null,
                }))
            }
        }

        return createSuccessResponse()
    } catch (error) {
        console.error("telegram-webhook error:", error)
        return createSuccessResponse()
    }
})
