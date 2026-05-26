export function isSuccessfulRetrievalSaveType(type: string | undefined) {
  return type === "saved" || type === "already_saved"
}

export function getRetrievalSaveFailureMessage(type: string | undefined) {
  switch (type) {
    case "invalid_retrieval_chunks":
      return "RETRIEVAL_CHUNKS_REJECTED"
    case "invalid_retrieval_result":
      return "RETRIEVAL_RESULT_REJECTED"
    case "invalid_request":
      return "RETRIEVAL_SAVE_INVALID_REQUEST"
    case "owner_mismatch":
      return "RETRIEVAL_SAVE_OWNER_MISMATCH"
    case "already_terminal":
      return "RETRIEVAL_SAVE_ALREADY_TERMINAL"
    default:
      return "RETRIEVAL_SAVE_FAILED"
  }
}
