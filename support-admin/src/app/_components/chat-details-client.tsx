"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { ChatMessage, ChatSummary, Manager } from "../_lib/page-types";
import { takeChatIntoWorkAction, resolveChatAction, transferChatAction, deleteMessageAction, deleteChatAction, markChatAsReadAction } from "../(protected)/_actions/chat-actions";
import { createSupabaseClient } from "@/lib/supabase";
import { ChatMessageInput } from "./chat-message-input";

const detailsHeaderClassName =
  "flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-start lg:justify-between";
const detailsEyebrowClassName = "support-text-muted text-xs uppercase tracking-[0.3em]";
const detailsTitleClassName = "support-text-primary mt-2 text-2xl font-semibold";
const detailsFullNameClassName = "support-text-secondary mt-2 text-sm";
const detailsMetaListClassName = "support-text-secondary mt-3 flex wrap gap-2 text-xs";
const messagesWrapperClassName = "mt-5 space-y-4";
const messageCardClassName = "support-card p-4";
const messageHeaderClassName =
  "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between";
const messageAuthorClassName = "flex items-center gap-3";
const messageIndexClassName =
  "flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white";
const messageAuthorNameClassName = "support-text-primary text-sm font-semibold";
const messageDateClassName = "support-text-muted mt-1 text-xs";
const messageBadgeClassName =
  "support-chip rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.22em]";
const messageTextClassName = "support-text-secondary mt-4 whitespace-pre-wrap break-words text-[15px] leading-7";
const primaryButtonClassName = "rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2";
const secondaryButtonClassName = "rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2";
const dangerButtonClassName = "rounded-xl border border-red-200 bg-white px-5 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50 flex items-center gap-2";

type ChatDetailsClientProps = {
  selectedChat: ChatSummary;
  initialMessages: ChatMessage[];
  selectedBotKey: string | null;
  allManagers: Manager[];
  currentManager: Manager | null;
};

function getSenderLabel(message: ChatMessage, chatTitle: string, allManagers: Manager[]) {
  if (message.senderType === "manager") {
    if (message.managerId) {
      const mgr = allManagers.find(m => m.id === message.managerId);
      if (mgr) return getManagerFullName(mgr);
    }
    return "Менеджер";
  }

  return chatTitle;
}

function getManagerFullName(manager: Manager) {
  return [manager.displayName, manager.lastName].filter(Boolean).join(" ");
}

function sortMessagesByCreatedAt(messages: ChatMessage[]) {
  return [...messages].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
}

export function ChatDetailsClient({ selectedChat, initialMessages, allManagers, currentManager }: ChatDetailsClientProps) {
  const [isPending, startTransition] = useTransition();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [showTransfer, setShowTransfer] = useState(false);
  const lastMarkedReadRef = useRef<string | null>(null);

  // Синхронизация при смене чата + сброс прочитанности
  useEffect(() => {
    setMessages(initialMessages);
    setShowTransfer(false);

    // Сброс прочитанности в базе при выборе чата (guard: только если есть непрочитанные и мы еще не помечали этот чат в текущей сессии)
    if (selectedChat.id && selectedChat.unreadCount > 0 && lastMarkedReadRef.current !== selectedChat.id) {
      lastMarkedReadRef.current = selectedChat.id;
      markChatAsReadAction(selectedChat.id).catch(err => 
        console.warn("Failed to mark chat as read:", err)
      );
    }
  }, [initialMessages, selectedChat.id, selectedChat.unreadCount]);

  // Realtime подписка
  useEffect(() => {
    const supabase = createSupabaseClient();
    
    const channel = supabase
      .channel(`chat_messages:${selectedChat.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: `chat_id=eq.${selectedChat.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newMessage = payload.new as any;
            setMessages((prev) => {
              const formatted: ChatMessage = {
                id: newMessage.id,
                chatId: newMessage.chat_id,
                senderType: newMessage.sender_type,
                managerId: newMessage.manager_id,
                text: newMessage.text,
                deliveryStatus: newMessage.delivery_status,
                deliveryError: newMessage.delivery_error,
                clientMessageId: newMessage.client_message_id,
                legacyMessageId: newMessage.legacy_message_id,
                createdAt: newMessage.created_at,
              };

              if (prev.some((message) => message.id === formatted.id)) {
                return prev;
              }

              const withoutOptimisticDuplicate = formatted.clientMessageId
                ? prev.filter((message) => message.clientMessageId !== formatted.clientMessageId)
                : prev;

              return sortMessagesByCreatedAt([...withoutOptimisticDuplicate, formatted]);
            });
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as any;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === updated.id || m.clientMessageId === updated.client_message_id
                  ? {
                      ...m,
                      id: updated.id,
                      deliveryStatus: updated.delivery_status,
                      deliveryError: updated.delivery_error,
                    }
                  : m
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedChat.id]);

  const handleTakeIntoWork = () => {
    startTransition(async () => {
      const result = await takeChatIntoWorkAction(selectedChat.id);
      if (!result.success) {
        alert("Ошибка: " + result.error);
      }
    });
  };

  const handleTransfer = (targetManagerId: string) => {
    startTransition(async () => {
      const result = await transferChatAction(selectedChat.id, targetManagerId);
      if (!result.success) {
        alert("Ошибка: " + result.error);
      } else {
        setShowTransfer(false);
      }
    });
  };

  const handleStatusChange = (newStatus: string) => {
    if (newStatus === selectedChat.status) return;

    let confirmationMsg = `Вы уверены, что хотите изменить статус на '${newStatus}'?`;
    if (newStatus === "open") {
      confirmationMsg = "Вы уверены, что хотите сбросить чат в 'open'? Это удалит текущее назначение на менеджера.";
    } else if (newStatus === "resolved") {
       confirmationMsg = "Завершить этот диалог?";
    }

    if (!confirm(confirmationMsg)) return;

    startTransition(async () => {
      // Подгружаем новый экшен динамически, чтобы не раздувать импорты в начале (условно)
      const { updateChatStatusAction } = await import("../(protected)/_actions/chat-actions");
      const result = await updateChatStatusAction(selectedChat.id, newStatus);
      if (!result.success) {
        alert("Ошибка: " + result.error);
      }
    });
  };

  // Авто-скролл вниз при добавлении сообщений
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const isResolved = selectedChat.status === "resolved" || selectedChat.status === "closed";
  const canReopen = currentManager?.role === "admin" || currentManager?.role === "supervisor";
  const isStatusLocked = selectedChat.status === "escalated" && currentManager?.role === "support";
  const isAdmin = currentManager?.role === "admin";

  const handleDeleteMessage = (messageId: string) => {
    if (!confirm("Удалить это сообщение? Это действие необратимо.")) return;
    startTransition(async () => {
      const result = await deleteMessageAction(messageId);
      if (!result.success) {
        alert("Ошибка: " + result.error);
      } else {
        setMessages(prev => prev.filter(m => m.id !== messageId));
      }
    });
  };

  const handleDeleteChat = () => {
    if (!confirm(`Удалить чат "${selectedChat.title}" полностью? Все сообщения и история будут уничтожены. Это действие необратимо!`)) return;
    startTransition(async () => {
      const result = await deleteChatAction(selectedChat.id);
      if (!result.success) {
        alert("Ошибка: " + result.error);
      }
    });
  };

  return (
    <>
      <div className={detailsHeaderClassName}>
        <div className="flex-1">
          <p className={detailsEyebrowClassName}>
            Диалог 
            {currentManager && (
              <span className="ml-2 text-[10px] bg-slate-200 text-slate-800 px-2 py-0.5 rounded-full">
                Вы вошли как: <span className="font-bold">{currentManager.displayName}</span> ({currentManager.role})
              </span>
            )}
          </p>
          <div className="flex items-center gap-3">
            <h2 className={detailsTitleClassName}>{selectedChat.title}</h2>
            {selectedChat.assignedManagerName && (() => {
              const assignedMgr = allManagers.find(m => m.id === selectedChat.assignedManagerId);
              const roleLabel = assignedMgr?.role?.toUpperCase() ?? "Менеджер";
              return (
                <span className="mt-2 flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-indigo-600 ring-1 ring-inset ring-indigo-500/20">
                  {roleLabel}: {selectedChat.assignedManagerName}
                </span>
              );
            })()}
          </div>
          {selectedChat.fullName ? (
            <p className={detailsFullNameClassName}>{selectedChat.fullName}</p>
          ) : null}
          <div className={detailsMetaListClassName}>
            <span className="support-chip flex items-center gap-1.5 rounded-full px-3 py-1 ring-1 ring-slate-200">
              сообщений: {messages.length}
            </span>
            <span className="support-chip flex items-center gap-1.5 rounded-full px-3 py-1 ring-1 ring-slate-200">
              chat_id: {selectedChat.telegramChatId}
            </span>
            <span className="support-chip flex items-center gap-1.5 rounded-full px-3 py-1 ring-1 ring-slate-200 font-bold uppercase">
              status: {selectedChat.status}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {selectedChat.status === "open" && (
            <button
              onClick={handleTakeIntoWork}
              disabled={isPending}
              className={primaryButtonClassName}
            >
              {isPending ? "Обработка..." : "Взять в работу"}
            </button>
          )}

          {selectedChat.status !== "open" && (
            <>
              {!isResolved && (
                <div className="relative">
                  <button
                    onClick={() => setShowTransfer(!showTransfer)}
                    disabled={isPending}
                    className={secondaryButtonClassName}
                  >
                    Передать
                  </button>
                  {showTransfer && (
                    <div className="absolute right-0 top-full z-10 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl ring-1 ring-black/5">
                      <p className="mb-2 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Выберите менеджера</p>
                      <div className="max-h-48 overflow-y-auto">
                        {allManagers.map(mgr => (
                          <button
                            key={mgr.id}
                            onClick={() => handleTransfer(mgr.id)}
                            className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 transition"
                          >
                            {getManagerFullName(mgr)} <span className="text-[10px] text-slate-400">({mgr.role})</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              <div className="relative">
                <select 
                  value={selectedChat.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  disabled={isPending || isStatusLocked}
                  className={`rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition focus:outline-none focus:ring-2 focus:ring-slate-900 ${isStatusLocked ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'hover:bg-slate-50 disabled:opacity-50'}`}
                  title={isStatusLocked ? "Эскалированный чат может менять только Admin или Supervisor" : undefined}
                >
                  {canReopen && <option value="open">Открыть заново (open)</option>}
                  <option value="in_progress">В работе (in_progress)</option>
                  <option value="escalated">Эскалирован (escalated)</option>
                  <option value="resolved">Решен (resolved)</option>
                  <option value="closed">Закрыт (closed)</option>
                </select>
              </div>
            </>
          )}

          {isAdmin && (
            <button
              onClick={handleDeleteChat}
              disabled={isPending}
              className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50 flex items-center gap-2"
              title="Удалить весь чат (только admin)"
            >
              🗑️ Удалить чат
            </button>
          )}
        </div>
      </div>

      <div className={`${messagesWrapperClassName} overflow-y-auto max-h-[400px] min-h-[300px] p-4 bg-slate-50/30 rounded-2xl border border-dashed border-slate-200 flex flex-col gap-4 shadow-inner`}>
        {messages.length === 0 && (
          <div className="text-center py-10 text-slate-400">Сообщений пока нет</div>
        )}
        {messages.map((message, index) => (
          <article key={message.id} className={`relative max-w-[80%] ${messageCardClassName} transition hover:shadow-md ${message.senderType === 'manager' ? 'ml-auto border-l-4 border-l-slate-900 bg-white' : 'mr-auto bg-slate-50'}`}>
            {isAdmin && (
              <button
                onClick={() => handleDeleteMessage(message.id)}
                disabled={isPending}
                className="absolute bottom-2 right-2 rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                title="Удалить сообщение"
              >
                🗑️
              </button>
            )}
            <div className={messageHeaderClassName}>
              <div className={messageAuthorClassName}>
                <div>
                  <p className={messageAuthorNameClassName}>{getSenderLabel(message, selectedChat.title, allManagers)}</p>
                  <p className={messageDateClassName}>
                    {new Date(message.createdAt).toLocaleString("ru-RU")}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {message.senderType === "manager" && message.deliveryStatus && (
                  <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold ${
                    message.deliveryStatus === 'pending' ? 'bg-amber-100 text-amber-700 animate-pulse' :
                    message.deliveryStatus === 'sent' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-red-100 text-red-700'
                  }`} title={message.deliveryError || undefined}>
                    {message.deliveryStatus === 'pending' ? '⏳ Отправка' : 
                     message.deliveryStatus === 'sent' ? '✅ Доставлено' : 
                     '❌ Ошибка'}
                  </span>
                )}
                <span className={messageBadgeClassName}>
                  {message.legacyMessageId ? `legacy #${message.legacyMessageId}` : "live"}
                </span>
              </div>
            </div>

            <p className={messageTextClassName}>{message.text || "Пустое сообщение"}</p>
          </article>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {!isResolved && (
          <ChatMessageInput
              chatId={selectedChat.id}
              onLocalMessage={(msg) => {
                setMessages(prev => sortMessagesByCreatedAt([...prev, msg]));
              }}
          />
      )}
      
      {isResolved && (
        <div className="mt-5 rounded-2xl bg-slate-100 p-8 text-center border-2 border-dashed border-slate-300">
           <p className="text-slate-500 font-semibold">Диалог завершен. История сохранена в архиве.</p>
        </div>
      )}
    </>
  );
}
