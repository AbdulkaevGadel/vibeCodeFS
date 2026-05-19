const composerUnavailableClassName =
  "mt-5 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-100 p-8 text-center";
const composerUnavailableTextClassName = "font-semibold text-slate-500";

type ComposerUnavailableProps = {
  reason: string | null;
};

export function ComposerUnavailable({ reason }: ComposerUnavailableProps) {
  return (
    <div className={composerUnavailableClassName}>
      <p className={composerUnavailableTextClassName}>{reason}</p>
    </div>
  );
}
