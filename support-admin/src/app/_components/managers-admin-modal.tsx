"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Manager } from "../_lib/page-types";
import { Button } from "./ui/button";
import {
  addManagerAction,
  createAuthUserAction,
  updateManagerAction,
} from "../(protected)/_actions/manager-actions";

type ManagersAdminModalProps = {
  managers: Manager[];
};

type ManagerRole = "admin" | "support" | "supervisor";

const overlayClassName =
  "fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-6 backdrop-blur-sm";
const modalClassName =
  "relative flex max-h-[78vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl";
const modalHeaderClassName =
  "border-b border-slate-200 bg-white px-6 py-5 pr-16";
const modalBodyClassName = "overflow-y-auto px-6 py-5";
const closeButtonClassName =
  "absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-2xl leading-none text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950";
const titleClassName = "text-xl font-semibold text-slate-950";
const sectionClassName = "rounded-xl border border-slate-200 p-4";
const sectionTitleClassName = "text-sm font-bold uppercase tracking-[0.18em] text-slate-500";
const formGridClassName = "mt-4 grid gap-3 md:grid-cols-2";
const inputClassName =
  "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900";
const selectClassName =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900";
const tableHeaderClassName = "text-left text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400";
const tableCellClassName = "border-t border-slate-100 py-3 pr-3 text-sm text-slate-700";

function getManagerFullName(manager: Manager) {
  return [manager.displayName, manager.lastName].filter(Boolean).join(" ");
}

export function ManagersAdminModal({ managers }: ManagersAdminModalProps) {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [editingManager, setEditingManager] = useState<Manager | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const runAction = (action: () => Promise<{ success: boolean; error: string | null }>, successMessage: string) => {
    setStatusMessage(null);
    setErrorMessage(null);

    startTransition(async () => {
      const result = await action();

      if (!result.success) {
        setErrorMessage(result.error ?? "Операция не выполнена.");
        return;
      }

      setStatusMessage(successMessage);
      setEditingManager(null);
      router.refresh();
    });
  };

  const handleCreateAuthUser = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = formData.get("email")?.toString() ?? "";
    const password = formData.get("password")?.toString() ?? "";

    runAction(
      () => createAuthUserAction({ email, password }),
      "Пользователь создан в Supabase Auth.",
    );
    event.currentTarget.reset();
  };

  const handleAddManager = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const role = formData.get("role")?.toString() as ManagerRole;

    runAction(
      () =>
        addManagerAction({
          email: formData.get("email")?.toString() ?? "",
          displayName: formData.get("displayName")?.toString() ?? "",
          lastName: formData.get("lastName")?.toString() ?? "",
          role,
        }),
      "Менеджер добавлен.",
    );
    event.currentTarget.reset();
  };

  const handleUpdateManager = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingManager) return;

    const formData = new FormData(event.currentTarget);
    const role = formData.get("role")?.toString() as ManagerRole;

    runAction(
      () =>
        updateManagerAction({
          managerId: editingManager.id,
          displayName: formData.get("displayName")?.toString() ?? "",
          lastName: formData.get("lastName")?.toString() ?? "",
          role,
        }),
      "Менеджер обновлён.",
    );
  };

  const modal = isOpen ? (
        <div className={overlayClassName} role="dialog" aria-modal="true" aria-label="Менеджеры">
          <div className={modalClassName}>
            <button
              type="button"
              className={closeButtonClassName}
              aria-label="Закрыть"
              onClick={() => {
                setIsOpen(false);
                setEditingManager(null);
                setStatusMessage(null);
                setErrorMessage(null);
              }}
            >
              ×
            </button>
            <div className={modalHeaderClassName}>
              <div>
                <h2 className={titleClassName}>Менеджеры</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Управление Auth-пользователями и ролями support-домена.
                </p>
              </div>
            </div>

            <div className={modalBodyClassName}>
              {statusMessage ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                  {statusMessage}
                </div>
              ) : null}

              {errorMessage ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {errorMessage}
                </div>
              ) : null}

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <section className={sectionClassName}>
                  <h3 className={sectionTitleClassName}>Создать пользователя</h3>
                  <form className={formGridClassName} onSubmit={handleCreateAuthUser}>
                    <label className="text-sm font-medium text-slate-700">
                      Email
                      <input name="email" type="email" required className={`${inputClassName} mt-1`} />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Пароль
                      <input
                        name="password"
                        type="password"
                        required
                        minLength={6}
                        className={`${inputClassName} mt-1`}
                      />
                    </label>
                    <div className="md:col-span-2">
                      <Button type="submit" isLoading={isPending} variant="primary">
                        Создать пользователя
                      </Button>
                    </div>
                  </form>
                </section>

                <section className={sectionClassName}>
                  <h3 className={sectionTitleClassName}>Добавить менеджера</h3>
                  <form className={formGridClassName} onSubmit={handleAddManager}>
                    <label className="text-sm font-medium text-slate-700">
                      Email
                      <input name="email" type="email" required className={`${inputClassName} mt-1`} />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Роль
                      <select name="role" required defaultValue="support" className={`${selectClassName} mt-1`}>
                        <option value="support">support</option>
                        <option value="supervisor">supervisor</option>
                        <option value="admin">admin</option>
                      </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Display name
                      <input name="displayName" className={`${inputClassName} mt-1`} />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Фамилия
                      <input name="lastName" className={`${inputClassName} mt-1`} />
                    </label>
                    <div className="md:col-span-2">
                      <Button type="submit" isLoading={isPending} variant="primary">
                        Добавить менеджера
                      </Button>
                    </div>
                  </form>
                </section>
              </div>

              <section className={`${sectionClassName} mt-4`}>
                <h3 className={sectionTitleClassName}>Текущие менеджеры</h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className={tableHeaderClassName}>Имя</th>
                        <th className={tableHeaderClassName}>Email</th>
                        <th className={tableHeaderClassName}>Роль</th>
                        <th className={tableHeaderClassName}>Действие</th>
                      </tr>
                    </thead>
                    <tbody>
                      {managers.map((manager) => (
                        <tr key={manager.id}>
                          <td className={tableCellClassName}>{getManagerFullName(manager)}</td>
                          <td className={tableCellClassName}>{manager.email ?? "-"}</td>
                          <td className={tableCellClassName}>{manager.role}</td>
                          <td className={tableCellClassName}>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setEditingManager(manager)}
                            >
                              Редактировать
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {editingManager ? (
                <section key={editingManager.id} className={`${sectionClassName} mt-4`}>
                  <h3 className={sectionTitleClassName}>Редактировать менеджера</h3>
                  <form className={formGridClassName} onSubmit={handleUpdateManager}>
                    <label className="text-sm font-medium text-slate-700">
                      Display name
                      <input
                        name="displayName"
                        required
                        defaultValue={editingManager.displayName}
                        className={`${inputClassName} mt-1`}
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Фамилия
                      <input
                        name="lastName"
                        defaultValue={editingManager.lastName ?? ""}
                        className={`${inputClassName} mt-1`}
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Роль
                      <select name="role" required defaultValue={editingManager.role} className={`${selectClassName} mt-1`}>
                        <option value="support">support</option>
                        <option value="supervisor">supervisor</option>
                        <option value="admin">admin</option>
                      </select>
                    </label>
                    <div className="flex items-end gap-3">
                      <Button type="submit" isLoading={isPending} variant="primary">
                        Сохранить
                      </Button>
                      <Button
                        type="button"
                        isLoading={isPending}
                        variant="ghost"
                        onClick={() => setEditingManager(null)}
                      >
                        Отмена
                      </Button>
                    </div>
                  </form>
                </section>
              ) : null}
            </div>
          </div>
        </div>
      ) : null;

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        Менеджеры
      </Button>

      {isMounted ? createPortal(modal, document.body) : null}
    </>
  );
}
