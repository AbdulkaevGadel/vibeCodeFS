import type { SupportChatStatus } from "@/entities/support-chat";

const statusSelectClassName =
  "support-interactive rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:opacity-50";

export type StatusOption = {
  value: SupportChatStatus;
  label: string;
};

type ChatStatusSelectorProps = {
  status: SupportChatStatus;
  isPending: boolean;
  visibleStatusOptions: StatusOption[];
  onStatusChange: (newStatus: SupportChatStatus) => void;
};

export function ChatStatusSelector({
  status,
  isPending,
  visibleStatusOptions,
  onStatusChange,
}: ChatStatusSelectorProps) {
  return (
    <div className="relative">
      <select
        value={status}
        onChange={(event) => onStatusChange(event.target.value as SupportChatStatus)}
        disabled={isPending}
        className={statusSelectClassName}
      >
        {visibleStatusOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
