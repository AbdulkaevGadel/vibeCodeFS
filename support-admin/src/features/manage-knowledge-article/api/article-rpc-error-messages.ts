type RpcErrorLike = {
  code?: string;
  message: string;
};

export function getCreateArticleRpcErrorMessage(error: RpcErrorLike) {
  if (error.message.includes("SLUG_GENERATION_FAILED")) {
    return "Не удалось создать уникальный адрес статьи. Попробуйте другой заголовок.";
  }

  return null;
}

export function getUpdateArticleRpcErrorMessage(error: RpcErrorLike) {
  if (error.message.includes("VERSION_CONFLICT_OR_FORBIDDEN")) {
    return "Ошибка доступа или конфликт версий: статья была изменена другим менеджером.";
  }

  if (error.code === "23505") {
    return "Статья с таким адресом (slug) уже существует.";
  }

  return null;
}

export function getSetArticleStatusRpcErrorMessage(error: RpcErrorLike) {
  if (error.message.includes("VERSION_CONFLICT_OR_FORBIDDEN")) {
    return "Не удалось изменить статус: конфликт версий.";
  }

  if (error.message.includes("KB_LIFECYCLE_FORBIDDEN")) {
    return "Только supervisor или admin может архивировать и восстанавливать статьи.";
  }

  return null;
}

export function getDeleteArticleRpcErrorMessage(error: RpcErrorLike) {
  if (error.message.includes("KB_DELETE_FORBIDDEN")) {
    return "Только supervisor или admin может удалить статью навсегда.";
  }

  if (error.message.includes("KB_DELETE_REQUIRES_ARCHIVED")) {
    return "Навсегда можно удалить только архивную статью.";
  }

  if (error.message.includes("VERSION_CONFLICT_OR_FORBIDDEN")) {
    return "Не удалось удалить статью: конфликт версий.";
  }

  return null;
}
