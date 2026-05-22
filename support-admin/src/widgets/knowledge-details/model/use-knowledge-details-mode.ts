"use client";

import { useState } from "react";
import type { KnowledgeArticle } from "@/entities/knowledge-article";

type UseKnowledgeDetailsModeArgs = {
  selectedArticle: KnowledgeArticle | null;
  isCreatingArticle: boolean;
  resetToSelectedArticle: () => void;
};

export function useKnowledgeDetailsMode({
  selectedArticle,
  isCreatingArticle,
  resetToSelectedArticle,
}: UseKnowledgeDetailsModeArgs) {
  const [isEditing, setIsEditing] = useState(isCreatingArticle);
  const [showHistory, setShowHistory] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const startEdit = () => {
    setIsEditing(true);
  };

  const finishEdit = () => {
    setIsEditing(false);
  };

  const toggleHistory = () => {
    setShowHistory((currentValue) => !currentValue);
    setIsEditing(false);
  };

  const cancelEdit = (onCreateCancel: () => void) => {
    if (selectedArticle) {
      setIsEditing(false);
      resetToSelectedArticle();
      return;
    }

    onCreateCancel();
  };

  const openDeleteConfirm = () => {
    if (!selectedArticle) {
      return;
    }

    setIsDeleteConfirmOpen(true);
  };

  const closeDeleteConfirm = () => {
    setIsDeleteConfirmOpen(false);
  };

  return {
    isEditing,
    showHistory,
    isDeleteConfirmOpen,
    startEdit,
    finishEdit,
    toggleHistory,
    cancelEdit,
    openDeleteConfirm,
    closeDeleteConfirm,
  };
}
