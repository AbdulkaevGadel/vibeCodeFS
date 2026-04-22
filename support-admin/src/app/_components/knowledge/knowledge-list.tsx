"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { KnowledgeArticle, KnowledgeBaseView, Manager } from "../../_lib/page-types";

type KnowledgeListProps = {
  articles: KnowledgeArticle[];
  selectedId: string | null;
  view: KnowledgeBaseView;
  currentManager: Manager | null;
};

export function KnowledgeList({ articles, selectedId, view, currentManager }: KnowledgeListProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const isArchiveView = view === "archive";
  const canCreateArticle = !!currentManager;

  const handleSearch = (val: string) => {
    setSearch(val);
    const params = new URLSearchParams();

    if (isArchiveView) params.set("view", "archive");
    if (val) params.set("search", val);
    
    // Используем плавный переход без полной перезагрузки
    router.replace(`/knowledge-base?${params.toString()}`);
  };

  const getArticleHref = (article: KnowledgeArticle) => {
    const params = new URLSearchParams();

    params.set("article", article.id);
    if (article.status === "archived") params.set("view", "archive");
    if (search) params.set("search", search);

    return `/knowledge-base?${params.toString()}`;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] overflow-hidden support-panel">
      <div className="p-5 border-b border-black/5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest support-text-muted">
            {isArchiveView ? "Архив" : "Статьи"}
          </h2>
        </div>
        
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Поиск по базе..."
            className="w-full bg-white/40 border border-black/5 rounded-2xl px-4 py-2 text-xs support-text-primary outline-none focus:border-indigo-500/30 transition-all font-medium placeholder:text-black/20"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 support-text-muted text-[10px]">
             🔎
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
        <div className="flex flex-col gap-2">
          {articles.length === 0 ? (
            <p className="p-4 text-sm support-text-muted italic text-center">
              {isArchiveView ? "В архиве пока нет статей." : "Статей пока нет."}
            </p>
          ) : (
            articles.map((article) => {
              const isActive = selectedId === article.id;
              return (
                <Link
                  key={article.id}
                  href={getArticleHref(article)}
                  className={`
                    flex flex-col gap-1.5 p-4 rounded-3xl transition-all duration-300
                    ${isActive 
                      ? "support-surface-accent scale-[1.02] shadow-lg shadow-black/5" 
                      : "hover:bg-white/40 border border-transparent support-text-primary"}
                  `}
                >
                  <p className={`text-sm font-semibold leading-tight ${isActive ? "text-white" : "support-text-primary"}`}>
                    {article.title}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-full ${
                      article.status === 'published' ? 'bg-emerald-500/10 text-emerald-600' :
                      article.status === 'archived' ? 'bg-rose-500/10 text-rose-600' :
                      'bg-amber-500/10 text-amber-600'
                    }`}>
                      {article.status === 'published' ? 'Live' : 
                       article.status === 'archived' ? 'Archived' : 'Draft'}
                    </span>
                    <span className={`text-[10px] truncate ${isActive ? "text-white/60" : "support-text-muted"}`}>
                      {article.slug}
                    </span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
      

      <div className="p-4 border-t border-black/5">
        {isArchiveView ? (
          <Button 
            href="/knowledge-base"
            variant="secondary"
            className="w-full"
          >
            К активным статьям
          </Button>
        ) : (
          canCreateArticle ? (
            <Button 
              href="/knowledge-base?mode=create"
              variant="primary"
              className="w-full"
            >
              Создать статью
            </Button>
          ) : null
        )}
      </div>
    </div>
  );
}
