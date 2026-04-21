"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { KnowledgeArticle } from "../../_lib/page-types";
import styles from "../../page.module.css";

type KnowledgeListProps = {
  articles: KnowledgeArticle[];
  selectedId: string | null;
};

export function KnowledgeList({ articles, selectedId }: KnowledgeListProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const handleSearch = (val: string) => {
    setSearch(val);
    const params = new URLSearchParams(window.location.search);
    if (val) params.set("search", val);
    else params.delete("search");
    
    // Используем плавный переход без полной перезагрузки
    router.replace(`/knowledge-base?${params.toString()}`);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] overflow-hidden support-panel">
      <div className="p-5 border-b border-black/5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest support-text-muted">Статьи</h2>
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
            <p className="p-4 text-sm support-text-muted italic text-center">Статей пока нет.</p>
          ) : (
            articles.map((article) => {
              const isActive = selectedId === article.id;
              return (
                <Link
                  key={article.id}
                  href={`/knowledge-base?article=${article.id}`}
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
      
      <div className="p-4 border-t border-white/5">
        <Link 
          href="/knowledge-base"
          className="flex items-center justify-center gap-2 w-full p-3 rounded-2xl bg-white/50 border border-white/20 text-xs font-bold support-text-primary hover:bg-white transition-all shadow-sm"
        >
          <span>Создать статью</span>
        </Link>
      </div>
    </div>
  );
}
