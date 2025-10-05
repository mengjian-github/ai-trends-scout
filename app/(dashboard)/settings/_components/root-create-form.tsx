"use client";

import { useEffect, useId, useState, useTransition } from "react";
import type { RootActionState } from "../action-state";
import { rootActionInitialState } from "../action-state";
import { createRootAction } from "../actions";
type RootCreateFormProps = {
  disabled: boolean;
  existingLocales: string[];
};

const inputClass =
  "w-full rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400 disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-white/5 disabled:text-white/40";

const helpTextClass = "text-xs text-white/50";

export const RootCreateForm = ({ disabled, existingLocales }: RootCreateFormProps) => {
  const [state, setState] = useState<RootActionState>(rootActionInitialState);
  const [isPending, startTransition] = useTransition();
  const localeListId = useId();

  useEffect(() => {
    if (!state.success) {
      return;
    }

    const timer = setTimeout(() => {
      setState(rootActionInitialState);
    }, 3600);

    return () => clearTimeout(timer);
  }, [state.success]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (disabled) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);

    startTransition(() => {
      createRootAction(formData).then((result) => {
        setState(result);

        if (result.success) {
          form.reset();
        }
      });
    });
  };

  const fieldErrors = state.fieldErrors ?? {};
  const isBusy = isPending || disabled;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-disabled={disabled}>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white" htmlFor="root-label">
          名称
        </label>
        <input
          id="root-label"
          name="label"
          type="text"
          placeholder="例如：Agent CRM"
          className={inputClass}
          disabled={isBusy}
          aria-invalid={fieldErrors.label ? true : undefined}
          required
        />
        {fieldErrors.label ? (
          <p className="text-xs text-rose-300">{fieldErrors.label[0]}</p>
        ) : (
          <p className={helpTextClass}>用于识别词根的可读名称，建议控制在 40 个字符内。</p>
        )}
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-white" htmlFor="root-keyword">
          词根
        </label>
        <input
          id="root-keyword"
          name="keyword"
          type="text"
          placeholder="例如：agentic sales"
          className={inputClass}
          disabled={isBusy}
          aria-invalid={fieldErrors.keyword ? true : undefined}
          required
        />
        {fieldErrors.keyword ? (
          <p className="text-xs text-rose-300">{fieldErrors.keyword[0]}</p>
        ) : (
          <p className={helpTextClass}>系统会基于该词根在 DataForSEO 中扩展相关关键词。</p>
        )}
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-white" htmlFor="root-locale">
          地区编码
        </label>
        <input
          id="root-locale"
          name="locale"
          type="text"
          placeholder="例如：us / gb / global"
          className={inputClass}
          disabled={isBusy}
          list={localeListId}
          aria-invalid={fieldErrors.locale ? true : undefined}
          required
        />
        <datalist id={localeListId}>
          {existingLocales.map((locale) => (
            <option key={locale} value={locale} />
          ))}
        </datalist>
        {fieldErrors.locale ? (
          <p className="text-xs text-rose-300">{fieldErrors.locale[0]}</p>
        ) : (
          <p className={helpTextClass}>使用小写 ISO-3166 代码；未匹配地区可使用 global。</p>
        )}
      </div>

      {state.error ? <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{state.error}</p> : null}
      {state.success && state.message ? (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">{state.message}</p>
      ) : null}

      <button
        type="submit"
        disabled={isBusy}
        className="inline-flex w-full items-center justify-center rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/50"
      >
        {isPending ? "保存中..." : "保存词根"}
      </button>

      {disabled ? (
        <p className="rounded-md bg-white/5 px-3 py-2 text-xs text-white/60">
          当前未配置 Supabase 服务端凭证，无法通过界面提交更改。
        </p>
      ) : null}
    </form>
  );
};

