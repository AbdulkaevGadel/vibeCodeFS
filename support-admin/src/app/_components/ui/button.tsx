"use client";

import Link from "next/link";
import React from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  active?: boolean;
  href?: string;
  children: React.ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  isLoading = false,
  active = false,
  href,
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  // Базовые стили (основаны на стиле кнопки Обновить)
  const baseStyles = "inline-flex items-center justify-center rounded-full font-bold transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100";
  
  // Варианты
  const variants = {
    primary: "support-surface-accent text-white shadow-sm hover:shadow-md hover:scale-[1.01]",
    secondary: "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-950 hover:text-slate-950 shadow-sm",
    danger: "bg-white border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-600 shadow-sm",
    ghost: "bg-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-950 border border-transparent hover:border-slate-200",
  };

  // Размеры
  const sizes = {
    sm: "px-3 py-1.5 text-[11px] uppercase tracking-wider",
    md: "px-5 py-2.5 text-sm",
    lg: "px-8 py-3.5 text-base",
  };

  // Состояние активного элемента (для табов ботов)
  const activeStyles = active ? "support-surface-accent text-white !border-transparent shadow-md" : "";

  const combinedClassName = `${baseStyles} ${variants[variant]} ${sizes[size]} ${activeStyles} ${className}`;

  const content = (
    <>
      {isLoading && (
        <span className="mr-2 animate-spin">◌</span>
      )}
      {children}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={combinedClassName}>
        {content}
      </Link>
    );
  }

  return (
    <button
      className={combinedClassName}
      disabled={disabled || isLoading}
      {...props}
    >
      {content}
    </button>
  );
}
