"use client";

import { useActionState } from "react";

import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

export const LoginForm = () => {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white" htmlFor="username">
          管理员账号
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          required
          className="w-full rounded-md border border-white/20 bg-black/40 px-3 py-2 text-sm text-white outline-none transition focus:border-white/60 focus:ring-2 focus:ring-white/20"
          placeholder="请输入管理员账号"
        />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white" htmlFor="password">
          密码
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-md border border-white/20 bg-black/40 px-3 py-2 text-sm text-white outline-none transition focus:border-white/60 focus:ring-2 focus:ring-white/20"
          placeholder="请输入密码"
        />
      </div>
      {state?.error ? (
        <p className="text-sm text-rose-300/90">{state.error}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-white px-3 py-2 text-sm font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "登录中..." : "登录"}
      </button>
    </form>
  );
};
