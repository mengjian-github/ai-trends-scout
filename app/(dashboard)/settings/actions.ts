"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { PostgrestError } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { rootActionInitialState, type RootActionState } from "./action-state";
import {
  createRoot,
  deleteRootById,
  updateRootById,
  type TrendRootInsert,
  type TrendRootUpdate,
} from "@/lib/supabase";

const createSchema = z.object({
  label: z.string().min(1, "请填写名称").max(120, "名称不能超过 120 个字符"),
  keyword: z.string().min(1, "请填写词根").max(120, "词根不能超过 120 个字符"),
  locale: z.string().min(2, "地区编码至少 2 个字符").max(16, "地区编码不能超过 16 个字符"),
});

const updateSchema = createSchema.extend({
  id: z.string().uuid({ message: "ID 格式不正确" }),
});

const toggleSchema = z.object({
  id: z.string().uuid({ message: "ID 格式不正确" }),
  nextStatus: z.enum(["true", "false"]),
});

const deleteSchema = z.object({
  id: z.string().uuid({ message: "ID 格式不正确" }),
});

const settingsPath = "/settings";

const supabaseConfigured = () => Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);

const missingSupabaseState = (): RootActionState => ({
  success: false,
  error: "未配置 Supabase 服务端凭证，暂时无法执行此操作。",
});

const validationErrorState = (error: z.ZodError): RootActionState => ({
  success: false,
  error: "表单校验失败，请检查输入内容。",
  fieldErrors: error.flatten().fieldErrors,
});

const isPostgrestError = (error: unknown): error is PostgrestError =>
  Boolean(error && typeof error === "object" && "code" in error && "message" in error);

const handleSupabaseError = (error: unknown, fallback: string): RootActionState => {
  console.error(fallback, error);

  if (isPostgrestError(error)) {
    if (error.code === "23505") {
      return {
        success: false,
        error: "该词根在该地区已存在，无法重复创建。",
      };
    }

    return {
      success: false,
      error: error.message ?? fallback,
    };
  }

  return {
    success: false,
    error: fallback,
  };
};

const sanitizeCreateInput = (input: z.infer<typeof createSchema>): TrendRootInsert => ({
  label: input.label.trim(),
  keyword: input.keyword.trim(),
  locale: input.locale.trim().toLowerCase(),
  is_active: true,
});

const sanitizeUpdateInput = (input: z.infer<typeof updateSchema>): TrendRootUpdate => ({
  label: input.label.trim(),
  keyword: input.keyword.trim(),
  locale: input.locale.trim().toLowerCase(),
});

const getString = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

export const createRootAction = async (formData: FormData): Promise<RootActionState> => {
  if (!supabaseConfigured()) {
    return missingSupabaseState();
  }

  const parsed = createSchema.safeParse({
    label: getString(formData, "label"),
    keyword: getString(formData, "keyword"),
    locale: getString(formData, "locale"),
  });

  if (!parsed.success) {
    return validationErrorState(parsed.error);
  }

  const payload = sanitizeCreateInput(parsed.data);

  if (!payload.label || !payload.keyword) {
    return {
      success: false,
      error: "名称或词根不能为空。",
    };
  }

  try {
    await createRoot(payload);
    revalidatePath(settingsPath);
    return {
      success: true,
      message: "已添加词根。",
    };
  } catch (error) {
    return handleSupabaseError(error, "新增词根失败，请稍后重试。");
  }
};

export const updateRootAction = async (formData: FormData): Promise<RootActionState> => {
  if (!supabaseConfigured()) {
    return missingSupabaseState();
  }

  const parsed = updateSchema.safeParse({
    id: getString(formData, "id"),
    label: getString(formData, "label"),
    keyword: getString(formData, "keyword"),
    locale: getString(formData, "locale"),
  });

  if (!parsed.success) {
    return validationErrorState(parsed.error);
  }

  const payload = sanitizeUpdateInput(parsed.data);

  try {
    const updated = await updateRootById(parsed.data.id, payload);

    if (!updated) {
      return {
        success: false,
        error: "未找到对应的词根记录。",
      };
    }

    revalidatePath(settingsPath);

    return {
      success: true,
      message: "词根已更新。",
    };
  } catch (error) {
    return handleSupabaseError(error, "更新失败，请稍后重试。");
  }
};

export const toggleRootStatusAction = async (formData: FormData): Promise<RootActionState> => {
  if (!supabaseConfigured()) {
    return missingSupabaseState();
  }

  const parsed = toggleSchema.safeParse({
    id: getString(formData, "id"),
    nextStatus: getString(formData, "nextStatus"),
  });

  if (!parsed.success) {
    return validationErrorState(parsed.error);
  }

  try {
    const updated = await updateRootById(parsed.data.id, {
      is_active: parsed.data.nextStatus === "true",
    });

    if (!updated) {
      return {
        success: false,
        error: "未找到对应的词根记录。",
      };
    }

    revalidatePath(settingsPath);

    return {
      success: true,
    };
  } catch (error) {
    return handleSupabaseError(error, "更新状态失败，请稍后重试。");
  }
};

export const deleteRootAction = async (formData: FormData): Promise<RootActionState> => {
  if (!supabaseConfigured()) {
    return missingSupabaseState();
  }

  const parsed = deleteSchema.safeParse({
    id: getString(formData, "id"),
  });

  if (!parsed.success) {
    return validationErrorState(parsed.error);
  }

  try {
    await deleteRootById(parsed.data.id);
    revalidatePath(settingsPath);
    return {
      success: true,
      message: "词根已删除。",
    };
  } catch (error) {
    return handleSupabaseError(error, "删除失败，请稍后重试。");
  }
};


