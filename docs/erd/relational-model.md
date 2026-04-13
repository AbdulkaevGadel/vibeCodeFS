# ERD — Support Domain Relational Model

## Purpose

This document visualizes the target relational model for the support-domain learning stage.

It reflects the current decisions from:
- `docs/plan/plan.md`

## Mermaid ERD

```mermaid
erDiagram
    CLIENTS ||--o{ CHATS : has
    CHATS ||--o{ MESSAGES : contains
    CHATS ||--|| CHAT_ASSIGNMENTS : has_current
    CHATS ||--o{ ASSIGNMENT_HISTORY : records
    MANAGERS ||--o{ CHAT_ASSIGNMENTS : owns_current
    MANAGERS ||--o{ ASSIGNMENT_HISTORY : assigns
    MANAGERS ||--o{ MESSAGES : sends

    CLIENTS {
        uuid id PK
        bigint telegram_user_id UK
        varchar username
        varchar first_name
        varchar last_name
        timestamptz created_at
        timestamptz updated_at
    }

    MANAGERS {
        uuid id PK
        uuid auth_user_id UK
        varchar email
        varchar display_name
        varchar role
        timestamptz created_at
        timestamptz updated_at
    }

    CHATS {
        uuid id PK
        bigint telegram_chat_id
        uuid client_id FK
        varchar bot_username
        varchar status
        varchar subject
        timestamptz created_at
        timestamptz updated_at
    }

    MESSAGES {
        uuid id PK
        uuid chat_id FK
        varchar sender_type
        uuid manager_id FK
        text text
        bigint telegram_message_id
        bigint legacy_message_id
        timestamptz created_at
    }

    CHAT_ASSIGNMENTS {
        uuid chat_id PK, FK
        uuid current_manager_id FK
        uuid assigned_by_manager_id FK
        timestamptz created_at
        timestamptz updated_at
    }

    ASSIGNMENT_HISTORY {
        uuid id PK
        uuid chat_id FK
        uuid from_manager_id FK
        uuid to_manager_id FK
        uuid assigned_by_manager_id FK
        timestamptz created_at
    }
```

## Notes

- `chat` is the central support-processing entity.
- `chat_assignments` stores only the current owner of the chat.
- `assignment_history` stores every reassignment event.
- `messages` stores message content, while `chats` stores workflow state.
- `bot_username` is stored on `chats` and is immutable per chat.
