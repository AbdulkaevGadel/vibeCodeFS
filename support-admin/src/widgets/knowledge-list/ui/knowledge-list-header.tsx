type KnowledgeListHeaderProps = {
  isArchiveView: boolean;
  search: string;
  onSearchChange: (value: string) => void;
};

const listHeaderClassName = "p-5 border-b border-black/5 flex flex-col gap-4";
const listTitleClassName = "text-xs font-bold uppercase tracking-widest support-text-muted";
const searchInputClassName =
  "w-full bg-white/40 border border-black/5 rounded-2xl px-4 py-2 text-xs support-text-primary outline-none focus:border-indigo-500/30 transition-all font-medium placeholder:text-black/20";
const searchIconClassName = "absolute right-3 top-1/2 -translate-y-1/2 support-text-muted text-[10px]";

export function KnowledgeListHeader({
  isArchiveView,
  search,
  onSearchChange,
}: KnowledgeListHeaderProps) {
  return (
    <div className={listHeaderClassName}>
      <h2 className={listTitleClassName}>
        {isArchiveView ? "Архив" : "Статьи"}
      </h2>

      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Поиск по базе..."
          className={searchInputClassName}
        />
        <div className={searchIconClassName}>🔎</div>
      </div>
    </div>
  );
}
