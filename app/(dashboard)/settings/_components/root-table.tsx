"use client";

import { ChangeEvent, useEffect, useMemo, useState, useTransition } from "react";
import type { TrendRootRow } from "@/lib/supabase";
import type { RootActionState } from "../action-state";
import { rootActionInitialState } from "../action-state";
import {
  deleteRootAction,
  toggleRootStatusAction,
  updateRootAction,
} from "../actions";

type RootTableProps = {
  roots: TrendRootRow[];
  supabaseConfigured: boolean;
};

type Feedback = {
  type: "success" | "error";
  message: string;
};

const tableHeaderClass = "pb-2 pr-4 text-xs font-medium uppercase tracking-wide text-white/50";
const cellClass = "py-3 pr-4 align-top";
const subtleButtonClass =
  "rounded-md border border-white/10 px-3 py-1 text-xs font-medium text-white/80 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:border-white/5 disabled:text-white/40";

const paginationSelectClass = "rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400";
const PAGE_SIZE_OPTIONS = [10, 25, 50];
const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];

const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const RootTable = ({ roots, supabaseConfigured }: RootTableProps) => {
  const total = roots.length;
  const activeCount = useMemo(() => roots.filter((root) => root.is_active).length, [roots]);
  const inactiveCount = total - activeCount;
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = useMemo(() => (total === 0 ? 1 : Math.ceil(total / pageSize)), [total, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedRoots = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return roots.slice(startIndex, startIndex + pageSize);
  }, [roots, currentPage, pageSize]);

  const handlePageSizeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextSize = Number(event.target.value);
    setPageSize(nextSize);
    setCurrentPage(1);
  };

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

  const firstItemIndex = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastItemIndex = Math.min(total, currentPage * pageSize);

  if (total === 0) {
    return (
      <div className="space-y-3 text-sm text-white/60">
        <p>当前没有任何词根记录。</p>
        {supabaseConfigured ? (
          <p>请在左侧表单中新建词根，或导入种子数据后刷新本页。</p>
        ) : (
          <p>配置 Supabase 管理凭证后即可从数据库读取词根列表。</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
        <span>共 {total} 条</span>
        <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-200">启用 {activeCount}</span>
        <span className="rounded-full bg-white/10 px-2 py-1 text-white/70">停用 {inactiveCount}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] table-fixed text-left text-sm">
          <thead>
            <tr>
              <th className={tableHeaderClass}>名称</th>
              <th className={tableHeaderClass}>词根</th>
              <th className={tableHeaderClass}>地区</th>
              <th className={tableHeaderClass}>状态</th>
              <th className={tableHeaderClass}>创建于</th>
              <th className={tableHeaderClass}>更新于</th>
              <th className={tableHeaderClass}>操作</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRoots.map((root) => (
              <RootTableRow key={root.id} root={root} supabaseConfigured={supabaseConfigured} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 text-xs text-white/60 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <span>每页显示</span>
          <select
            value={pageSize}
            onChange={handlePageSizeChange}
            className={paginationSelectClass}
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <span>条</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span>显示第 {firstItemIndex} - {lastItemIndex} 条（共 {total} 条）</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevPage}
              className={subtleButtonClass}
              disabled={currentPage === 1}
            >
              上一页
            </button>
            <span>第 {currentPage} / {totalPages} 页</span>
            <button
              type="button"
              onClick={handleNextPage}
              className={subtleButtonClass}
              disabled={currentPage === totalPages}
            >
              下一页
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

type RootTableRowProps = {
  root: TrendRootRow;
  supabaseConfigured: boolean;
};

const RootTableRow = ({ root, supabaseConfigured }: RootTableRowProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [updateState, setUpdateState] = useState<RootActionState>(rootActionInitialState);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isToggling, startToggling] = useTransition();
  const [isDeleting, startDeleting] = useTransition();

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeout = setTimeout(() => setFeedback(null), feedback.type === "success" ? 2400 : 4800);

    return () => clearTimeout(timeout);
  }, [feedback]);

  const handleEditToggle = () => {
    setIsEditing((prev) => {
      const next = !prev;
      if (next) {
        setUpdateState(rootActionInitialState);
      }
      return next;
    });
  };

  const handleUpdate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!supabaseConfigured) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);

    startSaving(() => {
      updateRootAction(formData).then((result) => {
        setUpdateState(result);

        if (result.success) {
          setFeedback({ type: "success", message: "词根已更新" });
          setIsEditing(false);
        } else if (result.error) {
          setFeedback({ type: "error", message: result.error });
        }
      });
    });
  };

  const handleToggle = () => {
    if (!supabaseConfigured) {
      return;
    }

    const formData = new FormData();
    formData.append("id", root.id);
    formData.append("nextStatus", (!root.is_active).toString());

    startToggling(() => {
      toggleRootStatusAction(formData).then((result) => {
        if (result.success) {
          setFeedback({ type: "success", message: root.is_active ? "已停用" : "已启用" });
        } else if (result.error) {
          setFeedback({ type: "error", message: result.error });
        }
      });
    });
  };

  const handleDelete = () => {
    if (!supabaseConfigured) {
      return;
    }

    const confirmed = window.confirm(`确认删除词根 “${root.label}” 吗？该操作不可撤销。`);
    if (!confirmed) {
      return;
    }

    const formData = new FormData();
    formData.append("id", root.id);

    startDeleting(() => {
      deleteRootAction(formData).then((result) => {
        if (result.success) {
          setFeedback({ type: "success", message: "已删除" });
        } else if (result.error) {
          setFeedback({ type: "error", message: result.error });
        }
      });
    });
  };

  const fieldErrors = updateState.fieldErrors ?? {};

  return (
    <>
      <tr className="border-b border-white/5">
        <td className={`${cellClass} font-medium text-white`}>{root.label}</td>
        <td className={`${cellClass} text-white/80`}>{root.keyword}</td>
        <td className={`${cellClass} font-mono text-xs uppercase text-white/70`}>{root.locale}</td>
        <td className={cellClass}>
          <span
            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
              root.is_active ? "bg-emerald-500/10 text-emerald-200" : "bg-white/10 text-white/60"
            }`}
          >
            {root.is_active ? "启用" : "停用"}
          </span>
        </td>
        <td className={`${cellClass} text-xs text-white/50`}>{formatDateTime(root.created_at)}</td>
        <td className={`${cellClass} text-xs text-white/50`}>{formatDateTime(root.updated_at)}</td>
        <td className={`${cellClass} space-y-2 text-xs text-white/70`} style={{ minWidth: "140px" }}>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleEditToggle}
              className={subtleButtonClass}
              disabled={!supabaseConfigured || isSaving || isDeleting}
            >
              {isEditing ? "取消" : "编辑"}
            </button>
            <button
              type="button"
              onClick={handleToggle}
              className={subtleButtonClass}
              disabled={!supabaseConfigured || isToggling || isDeleting}
            >
              {isToggling ? "处理中..." : root.is_active ? "停用" : "启用"}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className={`${subtleButtonClass} border-rose-400/40 text-rose-200 hover:border-rose-300 hover:text-rose-100`}
              disabled={!supabaseConfigured || isDeleting}
            >
              {isDeleting ? "删除中..." : "删除"}
            </button>
          </div>
          {feedback ? (
            <p
              className={`rounded-md px-2 py-1 ${
                feedback.type === "success"
                  ? "bg-emerald-500/10 text-emerald-200"
                  : "bg-rose-500/10 text-rose-200"
              }`}
            >
              {feedback.message}
            </p>
          ) : null}
        </td>
      </tr>
      {isEditing ? (
        <tr className="border-b border-white/5 bg-white/5">
          <td className="p-4" colSpan={7}>
            <form onSubmit={handleUpdate} className="grid gap-3 md:grid-cols-4 md:items-end">
              <input type="hidden" name="id" value={root.id} />
              <div className="md:col-span-1">
                <label
                  className="mb-1 block text-xs font-medium uppercase tracking-wide text-white/70"
                  htmlFor={`edit-label-${root.id}`}
                >
                  名称
                </label>
                <input
                  id={`edit-label-${root.id}`}
                  name="label"
                  defaultValue={root.label}
                  className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  disabled={isSaving}
                  aria-invalid={fieldErrors.label ? true : undefined}
                  required
                />
                {fieldErrors.label ? (
                  <p className="mt-1 text-xs text-rose-300">{fieldErrors.label[0]}</p>
                ) : null}
              </div>
              <div className="md:col-span-2">
                <label
                  className="mb-1 block text-xs font-medium uppercase tracking-wide text-white/70"
                  htmlFor={`edit-keyword-${root.id}`}
                >
                  词根
                </label>
                <input
                  id={`edit-keyword-${root.id}`}
                  name="keyword"
                  defaultValue={root.keyword}
                  className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  disabled={isSaving}
                  aria-invalid={fieldErrors.keyword ? true : undefined}
                  required
                />
                {fieldErrors.keyword ? (
                  <p className="mt-1 text-xs text-rose-300">{fieldErrors.keyword[0]}</p>
                ) : null}
              </div>
              <div className="md:col-span-1">
                <label
                  className="mb-1 block text-xs font-medium uppercase tracking-wide text-white/70"
                  htmlFor={`edit-locale-${root.id}`}
                >
                  地区
                </label>
                <input
                  id={`edit-locale-${root.id}`}
                  name="locale"
                  defaultValue={root.locale}
                  className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  disabled={isSaving}
                  aria-invalid={fieldErrors.locale ? true : undefined}
                  required
                />
                {fieldErrors.locale ? (
                  <p className="mt-1 text-xs text-rose-300">{fieldErrors.locale[0]}</p>
                ) : null}
              </div>
              {updateState.error ? (
                <p className="md:col-span-4 rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {updateState.error}
                </p>
              ) : null}
              <div className="md:col-span-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleEditToggle}
                  className="rounded-md border border-white/10 px-3 py-2 text-sm text-white/70 hover:border-white/30 hover:text-white"
                  disabled={isSaving}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/50"
                >
                  {isSaving ? "保存中..." : "保存"}
                </button>
              </div>
            </form>
          </td>
        </tr>
      ) : null}
    </>
  );
};

