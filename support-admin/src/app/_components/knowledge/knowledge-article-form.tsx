import { ArticleStatus } from "../../_lib/page-types";

type KnowledgeArticleFormProps = {
  slug: string;
  status: ArticleStatus;
  content: string;
  onSlugChange: (value: string) => void;
  onStatusChange: (value: ArticleStatus) => void;
  onContentChange: (value: string) => void;
};

const editFormClassName = "space-y-8 animate-in fade-in duration-500";
const editGridClassName = "grid grid-cols-2 gap-8";
const fieldWrapperClassName = "space-y-3";
const fieldLabelClassName = "text-[10px] font-black support-text-muted uppercase tracking-widest";
const fieldInputClassName =
  "w-full bg-white/50 border border-black/10 rounded-2xl px-5 py-3 text-sm support-text-primary outline-none focus:border-indigo-500 transition-all shadow-inner";
const selectInputClassName =
  "w-full bg-white/50 border border-black/10 rounded-2xl px-5 py-3 text-sm support-text-primary outline-none focus:border-indigo-500 transition-all appearance-none cursor-pointer shadow-inner";
const selectArrowClassName =
  "absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none support-text-muted";
const textareaClassName =
  "w-full bg-white/50 border border-black/10 rounded-[2.5rem] px-6 py-6 text-sm support-text-primary outline-none focus:border-indigo-500 transition-all leading-relaxed min-h-[500px] shadow-inner";

export function KnowledgeArticleForm({
  slug,
  status,
  content,
  onSlugChange,
  onStatusChange,
  onContentChange,
}: KnowledgeArticleFormProps) {
  return (
    <div className={editFormClassName}>
      <div className={editGridClassName}>
        <div className={fieldWrapperClassName}>
          <label className={fieldLabelClassName}>Адрес (Slug)</label>
          <input
            type="text"
            value={slug}
            onChange={(event) => onSlugChange(event.target.value)}
            placeholder="my-article-url"
            className={fieldInputClassName}
          />
        </div>
        <div className={fieldWrapperClassName}>
          <label className={fieldLabelClassName}>Статус</label>
          <div className="relative">
            <select
              value={status}
              onChange={(event) => onStatusChange(event.target.value as ArticleStatus)}
              className={selectInputClassName}
            >
              <option value="draft">Черновик</option>
              <option value="published">Опубликована</option>
            </select>
            <div className={selectArrowClassName}>▼</div>
          </div>
        </div>
      </div>

      <div className={fieldWrapperClassName}>
        <label className={fieldLabelClassName}>Контент (Markdown)</label>
        <textarea
          value={content}
          onChange={(event) => onContentChange(event.target.value)}
          rows={20}
          placeholder="Начните писать здесь..."
          className={textareaClassName}
        />
      </div>
    </div>
  );
}
