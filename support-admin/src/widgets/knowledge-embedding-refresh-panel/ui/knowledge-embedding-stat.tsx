const kbEmbeddingStatClassName = "min-w-0 rounded-xl border border-slate-100 bg-white/70 px-3 py-2";
const kbEmbeddingStatLabelClassName = "support-text-muted block truncate text-[10px] font-bold uppercase tracking-[0.12em]";
const kbEmbeddingStatValueClassName = "support-text-primary mt-1 block text-base font-semibold";

type KnowledgeEmbeddingStatProps = {
  label: string;
  value: number;
};

export function KnowledgeEmbeddingStat({
  label,
  value,
}: KnowledgeEmbeddingStatProps) {
  return (
    <div className={kbEmbeddingStatClassName}>
      <span className={kbEmbeddingStatLabelClassName}>{label}</span>
      <span className={kbEmbeddingStatValueClassName}>{value}</span>
    </div>
  );
}
