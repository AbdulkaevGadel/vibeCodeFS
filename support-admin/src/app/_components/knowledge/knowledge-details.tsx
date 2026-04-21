"use client";

import { useState, useTransition } from "react";
import { KnowledgeArticle, KnowledgeArticleHistory, Manager } from "../../_lib/page-types";
import { upsertArticleAction, setArticleStatusAction } from "../../(protected)/_actions/knowledge-actions";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";

type KnowledgeDetailsProps = {
  selectedArticle: KnowledgeArticle | null;
  history: KnowledgeArticleHistory[];
  currentManager: Manager | null;
};

export function KnowledgeDetails({ selectedArticle, history, currentManager }: KnowledgeDetailsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(!selectedArticle);
  const [showHistory, setShowHistory] = useState(false);
  
  // Форма
  const [title, setTitle] = useState(selectedArticle?.title ?? "");
  const [content, setContent] = useState(selectedArticle?.content ?? "");
  const [slug, setSlug] = useState(selectedArticle?.slug ?? "");
  const [status, setStatus] = useState(selectedArticle?.status ?? "draft");
  const [error, setError] = useState<string | null>(null);

  const canEdit = !!currentManager;
  const isAdmin = currentManager?.role === "admin" || currentManager?.role === "supervisor";

  const handleSave = async () => {
    setError(null);
    startTransition(async () => {
      const result = await upsertArticleAction(
        selectedArticle?.id ?? null,
        title,
        content,
        slug,
        status as any,
        selectedArticle?.version
      );

      if (result.error) {
        setError(result.error);
      } else {
        setIsEditing(false);
        if (!selectedArticle && result.data) {
           router.push(`/knowledge-base?article=${result.data.id}`);
        }
      }
    });
  };

  const handleStatusChange = async (newStatus: any) => {
    if (!selectedArticle) return;
    setError(null);
    startTransition(async () => {
      const result = await setArticleStatusAction(selectedArticle.id, newStatus, selectedArticle.version);
      if (result.error) {
        setError(result.error);
      }
    });
  };

  if (!selectedArticle && !isEditing) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-12 text-center text-white/20">
        <h3 className="text-xl font-medium mb-2">Выберите статью</h3>
        <p className="max-w-xs text-sm">Или создайте новую, чтобы начать наполнение базы знаний.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] overflow-hidden support-panel">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-black/5 bg-white/20">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Заголовок статьи..."
              className="w-full bg-transparent text-2xl font-bold support-text-primary outline-none border-b border-black/10 focus:border-indigo-500 transition-colors"
            />
          ) : (
            <h2 className="text-2xl font-bold support-text-primary truncate">{selectedArticle?.title}</h2>
          )}
        </div>
        
        <div className="flex items-center gap-3 ml-6">
           {selectedArticle && (
             <Button 
                onClick={() => {
                  setShowHistory(!showHistory);
                  setIsEditing(false);
                }}
                variant="secondary"
                active={showHistory}
                size="sm"
             >
               История
             </Button>
           )}

           {canEdit && !showHistory && (
             isEditing ? (
               <div className="flex items-center gap-2">
                  <Button 
                    onClick={() => {
                        if (selectedArticle) {
                            setIsEditing(false);
                            setTitle(selectedArticle.title);
                            setContent(selectedArticle.content);
                            setSlug(selectedArticle.slug);
                        } else {
                            router.push('/knowledge-base');
                        }
                    }}
                    variant="secondary"
                    size="sm"
                  >
                    Отмена
                  </Button>
                  <Button 
                    onClick={handleSave}
                    isLoading={isPending}
                    variant="secondary"
                    size="sm"
                  >
                    Сохранить
                  </Button>
               </div>
             ) : (
               <Button 
                 onClick={() => setIsEditing(true)}
                 variant="secondary"
                 size="sm"
               >
                 Редактировать
               </Button>
             )
           )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-4xl mx-auto p-10">
          {error && (
            <div className="mb-6 p-4 rounded-3xl support-alert-danger text-sm font-medium animate-in fade-in slide-in-from-top-2">
               {error}
            </div>
          )}

          {showHistory ? (
            <div className="space-y-8">
               <h3 className="text-sm font-black uppercase tracking-widest support-text-muted border-b border-black/5 pb-4">Архив изменений</h3>
               <div className="grid gap-4">
                 {history.length === 0 ? (
                   <p className="support-text-muted italic">История пуста.</p>
                 ) : (
                   history.map((item) => (
                     <div key={item.id} className="p-5 rounded-[2rem] bg-white/40 border border-black/5 hover:bg-white transition-all shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                           <span className="text-[10px] uppercase tracking-widest font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                             {item.changeType} v{item.version}
                           </span>
                           <span className="text-[10px] support-text-muted font-bold">
                             {new Date(item.changedAt).toLocaleString('ru-RU')}
                           </span>
                        </div>
                        <p className="text-sm font-bold support-text-primary mb-1">{item.title}</p>
                        <p className="text-xs support-text-secondary line-clamp-2 leading-relaxed">{item.content}</p>
                     </div>
                   ))
                 )}
               </div>
            </div>
          ) : isEditing ? (
            <div className="space-y-8 animate-in fade-in duration-500">
               <div className="grid grid-cols-2 gap-8">
                <div className="space-y-3">
                    <label className="text-[10px] font-black support-text-muted uppercase tracking-widest">Адрес (Slug)</label>
                    <input
                        type="text"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder="my-article-url"
                        className="w-full bg-white/50 border border-black/10 rounded-2xl px-5 py-3 text-sm support-text-primary outline-none focus:border-indigo-500 transition-all shadow-inner"
                    />
                </div>
                <div className="space-y-3">
                    <label className="text-[10px] font-black support-text-muted uppercase tracking-widest">Статус</label>
                    <div className="relative">
                      <select
                          value={status}
                          onChange={(e) => setStatus(e.target.value as any)}
                          className="w-full bg-white/50 border border-black/10 rounded-2xl px-5 py-3 text-sm support-text-primary outline-none focus:border-indigo-500 transition-all appearance-none cursor-pointer shadow-inner"
                      >
                          <option value="draft">Черновик</option>
                          <option value="published">Опубликована</option>
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none support-text-muted">
                        ▼
                      </div>
                    </div>
                </div>
               </div>

               <div className="space-y-3">
                 <label className="text-[10px] font-black support-text-muted uppercase tracking-widest">Контент (Markdown)</label>
                 <textarea
                   value={content}
                   onChange={(e) => setContent(e.target.value)}
                   rows={20}
                   placeholder="Начните писать здесь..."
                   className="w-full bg-white/50 border border-black/10 rounded-[2.5rem] px-6 py-6 text-sm support-text-primary outline-none focus:border-indigo-500 transition-all leading-relaxed min-h-[500px] shadow-inner"
                 />
               </div>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="flex items-center gap-4 mb-10">
                   <div className="support-surface-accent px-4 py-1.5 rounded-2xl text-[10px] uppercase font-black tracking-widest">
                      v{selectedArticle?.version}
                   </div>
                   <div className="text-[10px] uppercase tracking-widest support-text-muted font-bold">
                      Обновлено {selectedArticle && new Date(selectedArticle.updatedAt).toLocaleDateString('ru-RU')}
                   </div>
                </div>
              
                <div className="whitespace-pre-wrap text-[17px] leading-[1.8] support-text-primary font-medium tracking-tight">
                   {selectedArticle?.content}
                </div>

                {isAdmin && selectedArticle && (
                  <div className="mt-16 pt-10 border-t border-black/5 flex justify-end">
                     <Button 
                       onClick={() => handleStatusChange(selectedArticle.status === 'archived' ? 'draft' : 'archived')}
                       isLoading={isPending}
                       variant={selectedArticle.status === 'archived' ? 'secondary' : 'danger'}
                     >
                       {selectedArticle.status === 'archived' ? "Восстановить" : "Архивировать"}
                     </Button>
                  </div>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
