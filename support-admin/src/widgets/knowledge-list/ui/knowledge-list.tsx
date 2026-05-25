"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { KnowledgeArticle, KnowledgeBaseView } from "@/entities/knowledge-article";
import type { Manager } from "@/entities/manager";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { KnowledgeListHeader } from "./knowledge-list-header";

type KnowledgeListProps = {
  articles: KnowledgeArticle[];
  selectedId: string | null;
  view: KnowledgeBaseView;
  initialSearchQuery: string;
  currentManager: Manager | null;
};

const listPanelClassName = "flex flex-col h-[calc(100vh-200px)] overflow-hidden support-panel";
const scrollAreaClassName = "flex-1 overflow-y-auto custom-scrollbar p-3";
const emptyTextClassName = "p-4 text-sm support-text-muted italic text-center";
const articleLinkBaseClassName = "support-interactive flex flex-col gap-1.5 p-4 rounded-3xl transition-all duration-300";
const activeArticleLinkClassName = "support-surface-accent scale-[1.02] shadow-lg shadow-black/5";
const inactiveArticleLinkClassName = "hover:bg-white/40 border border-transparent support-text-primary";
const articleTitleBaseClassName = "text-sm font-semibold leading-tight";
const slugBaseClassName = "text-[10px] truncate";
const footerClassName = "p-4 border-t border-black/5";

const statusBadgeVariants: Record<KnowledgeArticle["status"], "success" | "danger" | "warning"> = {
  published: "success",
  archived: "danger",
  draft: "warning",
};

const statusLabels: Record<KnowledgeArticle["status"], string> = {
  published: "Live",
  archived: "Archived",
  draft: "Draft",
};

function getArticleLinkClassName(isActive: boolean) {
  return `${articleLinkBaseClassName} ${
    isActive ? activeArticleLinkClassName : inactiveArticleLinkClassName
  }`;
}

function getArticleTitleClassName(isActive: boolean) {
  return `${articleTitleBaseClassName} ${isActive ? "text-white" : "support-text-primary"}`;
}

function getSlugClassName(isActive: boolean) {
  return `${slugBaseClassName} ${isActive ? "text-white/60" : "support-text-muted"}`;
}

function getKnowledgeBaseHref(params: URLSearchParams) {
  const query = params.toString();

  return query ? `/knowledge-base?${query}` : "/knowledge-base";
}

export function KnowledgeList({
  articles,
  selectedId,
  view,
  initialSearchQuery,
  currentManager,
}: KnowledgeListProps) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearchQuery);
  const isArchiveView = view === "archive";
  const canCreateArticle = !!currentManager;

  useEffect(() => {
    setSearch(initialSearchQuery);
  }, [initialSearchQuery]);

  const handleSearch = (val: string) => {
    setSearch(val);
    const params = new URLSearchParams();

    if (isArchiveView) params.set("view", "archive");
    if (val) params.set("search", val);

    router.replace(getKnowledgeBaseHref(params));
  };

  const getArticleHref = (article: KnowledgeArticle) => {
    const params = new URLSearchParams();

    params.set("article", article.id);
    if (article.status === "archived") params.set("view", "archive");
    if (search) params.set("search", search);

    return getKnowledgeBaseHref(params);
  };

  return (
    <div className={listPanelClassName}>
      <KnowledgeListHeader
        isArchiveView={isArchiveView}
        search={search}
        onSearchChange={handleSearch}
      />
      <div className={scrollAreaClassName}>
        <div className="flex flex-col gap-2">
          {articles.length === 0 ? (
            <p className={emptyTextClassName}>
              {isArchiveView ? "В архиве пока нет статей." : "Статей пока нет."}
            </p>
          ) : (
            articles.map((article) => {
              const isActive = selectedId === article.id;
              return (
                <Link
                  key={article.id}
                  href={getArticleHref(article)}
                  className={getArticleLinkClassName(isActive)}
                >
                  <p className={getArticleTitleClassName(isActive)}>
                    {article.title}
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={statusBadgeVariants[article.status]}
                      size="sm"
                      className={isActive ? "bg-white/15 text-white" : ""}
                    >
                      {statusLabels[article.status]}
                    </Badge>
                    <span className={getSlugClassName(isActive)}>
                      {article.slug}
                    </span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
      <div className={footerClassName}>
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
