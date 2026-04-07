type DebugPanelProps = {
  title?: string;
  items?: string[];
  emptyText?: string;
};

export function DebugPanel({
  title = "Debug",
  items = [],
  emptyText = "Нет данных для отладки.",
}: DebugPanelProps) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
      <p className="mb-2 font-semibold uppercase tracking-[0.18em] text-slate-500">
        {title}
      </p>
      {items.length > 0 ? (
        <div className="space-y-1">
          {items.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      ) : (
        <p>{emptyText}</p>
      )}
    </div>
  );
}
