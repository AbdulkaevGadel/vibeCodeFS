import { FormEvent } from "react";
import { Button } from "@/shared/ui/button";

type CreateManagerAccountFormProps = {
  isPending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

const sectionClassName = "rounded-lg border border-slate-200 bg-white p-4 shadow-sm";
const sectionTitleClassName = "text-sm font-bold uppercase tracking-[0.18em] text-slate-500";
const formGridClassName = "mt-4 grid gap-3 md:grid-cols-2";
const inputClassName =
  "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900";
const labelClassName = "text-sm font-medium text-slate-700";
const fullRowClassName = "md:col-span-2";

export function CreateManagerAccountForm({
  isPending,
  onSubmit,
}: CreateManagerAccountFormProps) {
  return (
    <section className={sectionClassName}>
      <h2 className={sectionTitleClassName}>Создать manager account</h2>
      <form className={formGridClassName} onSubmit={onSubmit}>
        <label className={labelClassName}>
          Email
          <input name="email" type="email" required className={inputClassName} />
        </label>
        <label className={labelClassName}>
          Пароль
          <input
            name="password"
            type="password"
            required
            minLength={6}
            className={inputClassName}
          />
        </label>
        <label className={labelClassName}>
          Display name
          <input name="displayName" required className={inputClassName} />
        </label>
        <label className={labelClassName}>
          Фамилия
          <input name="lastName" className={inputClassName} />
        </label>
        <div className={fullRowClassName}>
          <Button type="submit" isLoading={isPending} variant="primary">
            Создать менеджера
          </Button>
        </div>
      </form>
    </section>
  );
}
