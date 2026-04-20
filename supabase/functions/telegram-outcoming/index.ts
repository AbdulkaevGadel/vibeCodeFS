import { createClient } from "@supabase/supabase-js"

const telegramApiBaseUrl = "https://api.telegram.org"

Deno.serve(async (req) => {
  // 1. Методы
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 })
  }

  try {
    // 2. Безопасность (Internal Secret)
    const internalSecret = req.headers.get("x-internal-secret")?.trim()
    const expectedSecret = Deno.env.get("INTERNAL_SECRET")?.trim()

    console.log(`Invoke received.`);
    console.log(`Provided secret: ${internalSecret ? internalSecret.substring(0, 3) + '...' : 'MISSING'}`);
    console.log(`Expected secret: ${expectedSecret ? expectedSecret.substring(0, 3) + '...' : 'MISSING'}`);

    if (!expectedSecret || internalSecret !== expectedSecret) {
      console.error("Unauthorized: Invalid internal secret");
      return new Response("Unauthorized", { status: 401 })
    }

    const payload = await req.json();
    console.log("Payload received:", JSON.stringify(payload));
    const { message_id, telegram_chat_id, text, is_duplicate } = payload;

    if (is_duplicate) {
      console.log(`Duplicate message detected for message_id=${message_id}, skipping Telegram send.`);
      return new Response(JSON.stringify({ ok: true, delivery_status: 'sent', duplicate: true }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    if (!message_id || !telegram_chat_id || !text) {
      return new Response("Missing required fields", { status: 400 })
    }

    const botToken = Deno.env.get("BOT_TOKEN")
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!botToken || !supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing environment variables (BOT_TOKEN, SUPABASE_URL, or SERVICE_ROLE_KEY)")
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 3. Отправка в Telegram
    let deliveryStatus = 'sent'
    let deliveryError = null

    console.log(`Sending message to Telegram: chat_id=${telegram_chat_id}, message_id=${message_id}`)

    const tgResponse = await fetch(`${telegramApiBaseUrl}/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegram_chat_id,
        text: text,
      }),
    })

    const tgData = await tgResponse.json()

    if (!tgResponse.ok || !tgData.ok) {
      deliveryStatus = 'failed'
      deliveryError = tgData.description || `Telegram API error ${tgResponse.status}`
      console.error("Telegram error:", tgData)
    }

    // 4. Обновление статуса в БД (Идемпотентно по message_id + pending)
    const { error: updateError } = await supabase
      .from('chat_messages')
      .update({ 
        delivery_status: deliveryStatus, 
        delivery_error: deliveryError 
      })
      .eq('id', message_id)
      .eq('delivery_status', 'pending') // Только если еще не обновляли

    if (updateError) {
      console.error("Database update error:", updateError)
    }

    return new Response(JSON.stringify({ ok: true, delivery_status: deliveryStatus }), {
      headers: { "Content-Type": "application/json" },
    })

  } catch (error) {
    console.error("telegram-outcoming error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    
    // В теории здесь можно попытаться пометить сообщение как failed 
    // если мы знаем message_id, но если упало на парсинге JSON — мы его не знаем.
    
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})
