"use client";

/**
 * 템플릿 CRUD (계약 tag: Admin SMS · 명세 §5.1).
 *
 * 모든 변경은 실제 API 응답을 진실로 삼는다 — 낙관적으로 목록을 고쳐 놓고 성공한 척하지
 * 않는다. 서버가 돌려준 행(특히 `version`)으로 목록을 갱신해야 다음 저장이 409 를 맞지 않는다.
 */

import { useCallback, useEffect, useState } from "react";
import {
  createSmsTemplate,
  defaultErrorMessage,
  isAborted,
  isApiError,
  listSmsTemplates,
  removeSmsTemplate,
  SMS_DEFAULT_TEMPLATE_MUST_BE_ACTIVE_CODE,
  SMS_DEFAULT_TEMPLATE_REASSIGN_REQUIRED_CODE,
  SMS_TEMPLATE_KEY_CONFLICT_CODE,
  SMS_TEMPLATE_VERSION_CONFLICT_CODE,
  smsContentErrorMessage,
  updateSmsTemplate,
  useKeyedOperationKeys,
} from "@/shared/api";
import type { SmsTemplate } from "@/shared/api";
import { newTemplateKey, type EditableSmsPurpose } from "@/entities/sms";

function templateErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    switch (error.code) {
      case SMS_TEMPLATE_VERSION_CONFLICT_CODE:
        return "다른 곳에서 이 템플릿이 먼저 바뀌었어요. 새로고침한 뒤 다시 저장해 주세요.";
      case SMS_TEMPLATE_KEY_CONFLICT_CODE:
        return "같은 키의 템플릿이 이미 있어요. 다시 시도해 주세요.";
      // 현재 기본 템플릿은 다른 템플릿을 기본으로 지정한 뒤에야 보관할 수 있다.
      case SMS_DEFAULT_TEMPLATE_REASSIGN_REQUIRED_CODE:
        return "기본 템플릿이라 바로 삭제할 수 없어요. 다른 템플릿을 먼저 기본으로 지정해 주세요.";
      case SMS_DEFAULT_TEMPLATE_MUST_BE_ACTIVE_CODE:
        return "보관된 템플릿은 기본으로 지정할 수 없어요. 먼저 활성 상태로 되돌려 주세요.";
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
  create: (input: { name: string; body: string; purpose: EditableSmsPurpose }) => Promise<SmsTemplate | null>;
  save: (
    templateId: string,
    input: { name: string; body: string; purpose: EditableSmsPurpose },
  ) => Promise<SmsTemplate | null>;
  archive: (templateId: string) => Promise<boolean>;
  /** 같은 용도의 기본 템플릿을 이 템플릿으로 옮긴다 — 성공하면 목록을 다시 읽는다. */
  setDefault: (templateId: string) => Promise<boolean>;
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

  /** 하드 삭제된 행을 목록에서 뺀다 — 서버가 행을 없앤 뒤에만 부른다. */
  const removeRow = useCallback((templateId: string) => {
    setTemplates((previous) => previous.filter((item) => item.templateId !== templateId));
  }, []);

  const create = useCallback(
    async (input: { name: string; body: string; purpose: EditableSmsPurpose }): Promise<SmsTemplate | null> => {
      const lookup = keys.keyFor("create");
      if (!lookup.ok) {
        setMutationError("확인되지 않은 요청이 남아 있어요. 새로고침한 뒤 다시 시도해 주세요.");
        return null;
      }

      setBusy(true);
      try {
        const created = await createSmsTemplate(
          // key 는 용도 접두어를 담아 생성 시 한 번 짓는다 — 이름과 달리 사람이 고치는 값이 아니다.
          { key: newTemplateKey(input.purpose), name: input.name, purpose: input.purpose, body: input.body },
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
    async (
      templateId: string,
      input: { name: string; body: string; purpose: EditableSmsPurpose },
    ): Promise<SmsTemplate | null> => {
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
        // 이름·본문·용도를 함께 보낸다 — 서버 응답(특히 새 version·purpose)이 진실이다.
        const saved = await updateSmsTemplate(
          templateId,
          { name: input.name, body: input.body, purpose: input.purpose, version: current.version },
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

      // 마지막 활성 템플릿을 전역으로 막지 않는다 — 활성 기본은 용도(purpose)별로 하나 유지되고,
      // 그 보호는 서버가(그리고 현재 기본은 SMS_DEFAULT_TEMPLATE_REASSIGN_REQUIRED 로) 담당한다.
      const lookup = keys.keyFor(`archive:${templateId}`);
      if (!lookup.ok) {
        setMutationError("확인되지 않은 요청이 남아 있어요. 새로고침한 뒤 다시 시도해 주세요.");
        return false;
      }

      setBusy(true);
      try {
        const result = await removeSmsTemplate(templateId, current.version, {
          idempotencyKey: lookup.key,
        });
        keys.settle(`archive:${templateId}`);
        // 서버 결과를 그대로 반영한다: 하드 삭제면 행을 빼고, 보관이면 내려온 inactive 행으로 교체한다
        // (active 목록에서 저절로 빠진다). 응답 모양이 어긋나면 지어내지 않고 목록을 다시 읽는다.
        if (result.disposition === "DELETED") {
          removeRow(templateId);
        } else if (result.disposition === "ARCHIVED" && result.archivedTemplate !== null) {
          upsert(result.archivedTemplate);
        } else {
          reload();
        }
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
    [keys, templates, upsert, removeRow, reload],
  );

  const setDefault = useCallback(
    async (templateId: string): Promise<boolean> => {
      const current = templates.find((item) => item.templateId === templateId);
      if (current === undefined) {
        setMutationError("템플릿을 찾을 수 없어요. 새로고침해 주세요.");
        return false;
      }

      // 이미 기본이면 왕복하지 않는다 — 서버 상태를 바꿀 게 없다.
      if (current.isDefault) return true;

      const lookup = keys.keyFor(`default:${templateId}`);
      if (!lookup.ok) {
        setMutationError("확인되지 않은 요청이 남아 있어요. 새로고침한 뒤 다시 시도해 주세요.");
        return false;
      }

      setBusy(true);
      try {
        await updateSmsTemplate(
          templateId,
          { isDefault: true, version: current.version },
          { idempotencyKey: lookup.key },
        );
        keys.settle(`default:${templateId}`);
        setMutationError(null);
        // 서버가 같은 용도의 이전 기본을 동시에 내리고 version 도 올린다 — 응답 한 행만 반영하면
        // 이전 기본이 stale 로 남는다. 반드시 목록을 다시 읽어 진실을 통째로 갱신한다.
        reload();
        return true;
      } catch (caught) {
        keys.settle(`default:${templateId}`, caught);
        setMutationError(templateErrorMessage(caught));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [keys, templates, reload],
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
    setDefault,
    mutationError,
    clearMutationError,
  };
}
