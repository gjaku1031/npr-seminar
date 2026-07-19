"use client";

/**
 * 템플릿 CRUD (계약 tag: Admin SMS · 명세 §5.1).
 *
 * 모든 변경은 실제 API 응답을 진실로 삼는다 — 낙관적으로 목록을 고쳐 놓고 성공한 척하지
 * 않는다. 서버가 돌려준 행(특히 `version`)으로 목록을 갱신해야 다음 저장이 409 를 맞지 않는다.
 */

import { useCallback, useEffect, useState } from "react";
import {
  archiveSmsTemplate,
  createSmsTemplate,
  defaultErrorMessage,
  isAborted,
  isApiError,
  isLastActiveTemplate,
  listSmsTemplates,
  SMS_LAST_ACTIVE_TEMPLATE_REQUIRED_CODE,
  SMS_TEMPLATE_KEY_CONFLICT_CODE,
  SMS_TEMPLATE_VERSION_CONFLICT_CODE,
  smsContentErrorMessage,
  updateSmsTemplate,
  useKeyedOperationKeys,
} from "@/shared/api";
import type { SmsTemplate } from "@/shared/api";

/** 이 화면이 만드는 템플릿의 용도는 관리자 그룹 발송 하나뿐이다 (계약 SmsPurpose). */
const TEMPLATE_PURPOSE = "ADMIN_GROUP" as const;

/** 계약 key 패턴 `^[A-Z0-9_]{3,80}$` — 이름과 달리 사람이 고치는 값이 아니라 생성 시 한 번 짓는다. */
export function newTemplateKey(): string {
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  return `GROUP_${suffix}`;
}

function templateErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    switch (error.code) {
      case SMS_TEMPLATE_VERSION_CONFLICT_CODE:
        return "다른 곳에서 이 템플릿이 먼저 바뀌었어요. 새로고침한 뒤 다시 저장해 주세요.";
      // 서버도 마지막 활성 템플릿을 지킨다 — 화면 판정이 목록보다 낡았을 때 여기로 온다.
      case SMS_LAST_ACTIVE_TEMPLATE_REQUIRED_CODE:
        return "마지막 남은 템플릿이라 삭제할 수 없어요. 새 템플릿을 먼저 만들어 주세요.";
      case SMS_TEMPLATE_KEY_CONFLICT_CODE:
        return "같은 키의 템플릿이 이미 있어요. 다시 시도해 주세요.";
      default:
        break;
    }
  }
  // 본문·제목·변수 검증은 발송 경로와 같은 규칙이라 문구도 같은 곳에서 가져온다.
  return smsContentErrorMessage(error) ?? defaultErrorMessage(error);
}

export interface SmsTemplatesState {
  templates: SmsTemplate[];
  /** 목록에 보이는 건 활성 템플릿뿐이다 — 보관된 건 화면에서 내려간다. */
  active: SmsTemplate[];
  loading: boolean;
  error: string | null;
  busy: boolean;
  reload: () => void;
  create: (input: { name: string; body: string }) => Promise<SmsTemplate | null>;
  save: (templateId: string, input: { name: string; body: string }) => Promise<SmsTemplate | null>;
  archive: (templateId: string) => Promise<boolean>;
  /** 조작 실패 문구 — 성공하면 null 로 지운다. */
  mutationError: string | null;
  clearMutationError: () => void;
}

export function useSmsTemplates(): SmsTemplatesState {
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // 템플릿마다 독립된 조작 — 결과가 미상인 동안 같은 키로만 재시도한다.
  const keys = useKeyedOperationKeys();

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const next = await listSmsTemplates(controller.signal);
        if (controller.signal.aborted) return;
        setTemplates(next);
        setError(null);
      } catch (caught) {
        if (isAborted(caught) || controller.signal.aborted) return;
        setError(defaultErrorMessage(caught));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);
  const clearMutationError = useCallback(() => setMutationError(null), []);

  /** 서버가 돌려준 행으로 교체 — 여기 오는 값만이 새 version 의 출처다. */
  const upsert = useCallback((row: SmsTemplate) => {
    setTemplates((previous) => {
      const index = previous.findIndex((item) => item.templateId === row.templateId);
      if (index === -1) return [...previous, row];
      const next = [...previous];
      next[index] = row;
      return next;
    });
  }, []);

  const create = useCallback(
    async (input: { name: string; body: string }): Promise<SmsTemplate | null> => {
      const lookup = keys.keyFor("create");
      if (!lookup.ok) {
        setMutationError("확인되지 않은 요청이 남아 있어요. 새로고침한 뒤 다시 시도해 주세요.");
        return null;
      }

      setBusy(true);
      try {
        const created = await createSmsTemplate(
          { key: newTemplateKey(), name: input.name, purpose: TEMPLATE_PURPOSE, body: input.body },
          { idempotencyKey: lookup.key },
        );
        keys.settle("create");
        upsert(created);
        setMutationError(null);
        return created;
      } catch (caught) {
        keys.settle("create", caught);
        setMutationError(templateErrorMessage(caught));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [keys, upsert],
  );

  const save = useCallback(
    async (templateId: string, input: { name: string; body: string }): Promise<SmsTemplate | null> => {
      const current = templates.find((item) => item.templateId === templateId);
      if (current === undefined) {
        setMutationError("템플릿을 찾을 수 없어요. 새로고침해 주세요.");
        return null;
      }

      const lookup = keys.keyFor(`save:${templateId}`);
      if (!lookup.ok) {
        setMutationError("확인되지 않은 요청이 남아 있어요. 새로고침한 뒤 다시 시도해 주세요.");
        return null;
      }

      setBusy(true);
      try {
        const saved = await updateSmsTemplate(
          templateId,
          { name: input.name, body: input.body, version: current.version },
          { idempotencyKey: lookup.key },
        );
        keys.settle(`save:${templateId}`);
        upsert(saved);
        setMutationError(null);
        return saved;
      } catch (caught) {
        keys.settle(`save:${templateId}`, caught);
        setMutationError(templateErrorMessage(caught));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [keys, templates, upsert],
  );

  const archive = useCallback(
    async (templateId: string): Promise<boolean> => {
      const current = templates.find((item) => item.templateId === templateId);
      if (current === undefined) {
        setMutationError("템플릿을 찾을 수 없어요. 새로고침해 주세요.");
        return false;
      }

      // 명세 §5.1 — 마지막 활성 템플릿은 남긴다. 서버에 물어보기 전에 막고 이유를 말한다.
      if (isLastActiveTemplate(templates, templateId)) {
        setMutationError("마지막 남은 템플릿이라 삭제할 수 없어요. 새 템플릿을 먼저 만들어 주세요.");
        return false;
      }

      const lookup = keys.keyFor(`archive:${templateId}`);
      if (!lookup.ok) {
        setMutationError("확인되지 않은 요청이 남아 있어요. 새로고침한 뒤 다시 시도해 주세요.");
        return false;
      }

      setBusy(true);
      try {
        const archived = await archiveSmsTemplate(templateId, current.version, {
          idempotencyKey: lookup.key,
        });
        keys.settle(`archive:${templateId}`);
        upsert(archived);
        setMutationError(null);
        return true;
      } catch (caught) {
        keys.settle(`archive:${templateId}`, caught);
        setMutationError(templateErrorMessage(caught));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [keys, templates, upsert],
  );

  return {
    templates,
    active: templates.filter((template) => template.active),
    loading,
    error,
    busy,
    reload,
    create,
    save,
    archive,
    mutationError,
    clearMutationError,
  };
}
