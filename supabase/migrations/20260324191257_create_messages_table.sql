create table messages
(
    id         bigint primary key generated always as identity,
    chat_id    bigint not null,
    user_id    bigint not null,
    username   varchar(32),
    first_name varchar(64),
    last_name  varchar(64),
    text       text   not null,
    created_at timestamptz default now()
);