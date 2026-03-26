export type TelegramChat = {
  id?: number
}

export type TelegramUser = {
  id?: number
  username?: string
  first_name?: string
  last_name?: string
}

export type TelegramMessage = {
  text?: string
  chat?: TelegramChat
  from?: TelegramUser
}

export type TelegramUpdate = {
  message?: TelegramMessage
}
