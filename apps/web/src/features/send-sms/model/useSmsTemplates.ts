"use client";

/**
 * 문자 템플릿 목록·생성·수정·삭제 훅. 계약 tag: Admin SMS
 *
 * 모든 변경은 실제 API 응답을 진실로 삼음 — 낙관적으로 목록을 고쳐 놓고 성공한 척하지
 * 않음. 서버가 돌려준 행(특히 `version`)으로 목록을 갱신해야 다음 저장이 409 를 맞지 않음
 */

import { useCallback, useEffect, useState } from "react";
import {
  createSmsTemplate,
  defaultErrorMessage,
  isAborted,
  isApiError,
  listSmsTemplates,
  removeSmsTemplate,
  sameOperationIntent,
  SMS_DEFAULT_TEMPLATE_MUST_BE_ACTIVE_CODE,
  SMS_DEFAULT_TEMPLATE_REASSIGN_REQUIRED_CODE,
  SMS_TEMPLATE_KEY_CONFLICT_CODE,
  SMS_TEMPLATE_VERSION_CONFLICT_CODE,
  smsContentErrorMessage,
  updateSmsTemplate,
  useKeyedOperationIntents,
  useKeyedOperationKeys,
} from "@/shared/api";
import type { CreateSmsTemplateInput, SmsEditablePurpose, SmsTemplate, SmsTemplatePolicy } from "@/shared/api";
import { newTemplateKey } from "@/entities/sms";

/**
 * 화면이 생성할 수 있는 편집 용도로 좁힌, 멱등 전송용 전체 본문
 */
type SmsCreateIntent = Omit<CreateSmsTemplateInput, "purpose"> & { purpose: SmsEditablePurpose };

/**
 * 템플릿 변경 오류를 안내 문구로 변환
 */
function templateErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    switch (error.code) {
      case SMS_TEMPLATE_VERSION_CONFLICT_CODE:
        return "다른 곳에서 이 템플릿이 먼저 바뀌었어요. 새로고침한 뒤 다시 저장해 주세요.";
      case SMS_TEMPLATE_KEY_CONFLICT_CODE:
        return "같은 키의 템플릿이 이미 있어요. 다시 시도해 주세요.";
      // 현재 기본 템플릿은 다른 템플릿을 기본으로 지정한 뒤에야 보관할 수 있음
      case SMS_DEFAULT_TEMPLATE_REASSIGN_REQUIRED_CODE:
        return "기본 템플릿이라 바로 삭제할 수 없어요. 다른 템플릿을 먼저 기본으로 지정해 주세요.";
      case SMS_DEFAULT_TEMPLATE_MUST_BE_ACTIVE_CODE:
        return "보관된 템플릿은 기본으로 지정할 수 없어요. 먼저 활성 상태로 되돌려 주세요.";
      default:
        break;
    }
  }
  // 본문·제목·변수 검증은 발송 경로와 같은 규칙이라 문구도 같은 곳에서 가져옴
  return smsContentErrorMessage(error) ?? defaultErrorMessage(error);
}

/**
 * 문자 템플릿 목록 상태와 변경 동작
 */
export interface SmsTemplatesState {
  /**
   * 템플릿 목록
   */
  templates: SmsTemplate[];
  /**
   * 목록에 보이는 건 활성 템플릿뿐임 — 보관된 건 화면에서 내려감
   */
  active: SmsTemplate[];

  /**
   * 불러오는 중 여부
   */
  loading: boolean;

  /**
   * 오류 문구. 없으면 null
   */
  error: string | null;

  /**
   * 처리 중 여부
   */
  busy: boolean;

  /**
   * 다시 불러오기
   */
  reload: () => void;

  /**
   * 템플릿 생성. 실패하면 null
   */
  create: (input: { name: string; body: string; purpose: SmsEditablePurpose }) => Promise<SmsTemplate | null>;
  /**
   * 결과를 알 수 없는 생성 요청의 표시 정보. 실제 요청 본문은 의도 훅에 보존함
   */
  pendingCreate: { name: string; purpose: SmsEditablePurpose } | null;
  /**
   * 이전 생성 요청의 멱등 키와 본문을 그대로 다시 보냄
   */
  retryCreate: () => Promise<SmsTemplate | null>;

  /**
   * 템플릿 수정. 실패하면 null
   */
  save: (
    templateId: string,
    input: { name: string; body: string; purpose: SmsEditablePurpose },
  ) => Promise<SmsTemplate | null>;

  /**
   * 템플릿 보관·삭제. 성공하면 true
   */
  archive: (templateId: string) => Promise<boolean>;
  /**
   * 같은 용도의 기본 템플릿을 이 템플릿으로 옮김 — 성공하면 목록을 다시 읽음
   */
  setDefault: (templateId: string) => Promise<boolean>;
  /**
   * 조작 실패 문구 — 성공하면 null 로 지움
   */
  mutationError: string | null;

  /**
   * 변경 오류 문구 지우기
   */
  clearMutationError: () => void;
}

/**
 * 서버 정책의 접두어로 템플릿을 생성하고, 변경 결과는 서버 목록에 반영함
 */
export function useSmsTemplates(policy: SmsTemplatePolicy | null): SmsTemplatesState {
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [pendingCreate, setPendingCreate] = useState<{ name: string; purpose: SmsEditablePurpose } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // 생성은 키와 전체 본문을 함께 붙잡음. 다른 조작은 기존 대상별 키 수명을 유지함
  const createIntents = useKeyedOperationIntents<SmsCreateIntent>(1);
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

  // 서버가 돌려준 행으로 교체 — 여기 오는 값만이 새 version 의 출처임
  const upsert = useCallback((row: SmsTemplate) => {
    setTemplates((previous) => {
      const index = previous.findIndex((item) => item.templateId === row.templateId);
      if (index === -1) return [...previous, row];
      const next = [...previous];
      next[index] = row;
      return next;
    });
  }, []);

  // 하드 삭제된 행을 목록에서 뺌 — 서버가 행을 없앤 뒤에만 부름
  const removeRow = useCallback((templateId: string) => {
    setTemplates((previous) => previous.filter((item) => item.templateId !== templateId));
  }, []);

  // 생성 본문과 멱등 키를 함께 고정해 전송하고, 미확정 결과일 때만 둘 다 보존함
  const submitCreate = useCallback(async (input: SmsCreateIntent): Promise<SmsTemplate | null> => {
    const lookup = createIntents.begin("create", input);
    if (!lookup.ok) {
      setMutationError(lookup.reason === "diverged"
        ? "이전 생성 결과가 확인되지 않았어요. 아래에서 이전 요청을 그대로 다시 시도해 주세요."
        : "확인되지 않은 요청이 남아 있어요. 이전 요청을 먼저 다시 시도해 주세요.");
      return null;
    }

    setMutationError(null);
    setBusy(true);
    try {
      // 첫 전송과 재시도 모두 의도 훅이 보존한 동일한 본문·멱등 키를 사용함
      const created = await createSmsTemplate(lookup.intent, { idempotencyKey: lookup.key });
      createIntents.settle("create");
      setPendingCreate(null);
      upsert(created);
      setMutationError(null);
      return created;
    } catch (caught) {
      createIntents.settle("create", caught);
      const retained = createIntents.retained("create");
      setPendingCreate(retained === null ? null : { name: retained.name, purpose: retained.purpose });
      setMutationError(templateErrorMessage(caught));
      return null;
    } finally {
      setBusy(false);
    }
  }, [createIntents, upsert]);

  // 새 생성은 새 키를 만들고, 미확정 생성은 원래 입력과 같을 때만 다시 보냄
  const create = useCallback(
    async (input: { name: string; body: string; purpose: SmsEditablePurpose }): Promise<SmsTemplate | null> => {
      const retained = createIntents.retained("create");
      if (retained !== null) {
        if (!sameOperationIntent(input, { name: retained.name, body: retained.body, purpose: retained.purpose })) {
          setMutationError("이전 생성 결과가 확인되지 않았어요. 아래에서 이전 요청을 그대로 다시 시도해 주세요.");
          setPendingCreate({ name: retained.name, purpose: retained.purpose });
          return null;
        }
        return submitCreate(retained);
      }

      const key = policy === null ? null : newTemplateKey(policy, input.purpose);
      if (key === null) {
        setMutationError("문자 편집 정책을 확인할 수 없어요. 정책을 다시 불러와 주세요.");
        return null;
      }
      return submitCreate({ key, ...input });
    },
    [createIntents, policy, submitCreate],
  );

  // 화면의 명시적 재시도는 현재 필터 값과 무관하게 붙잡힌 원래 생성만 보냄
  const retryCreate = useCallback(async (): Promise<SmsTemplate | null> => {
    const retained = createIntents.retained("create");
    if (retained === null) return null;
    return submitCreate(retained);
  }, [createIntents, submitCreate]);

  const save = useCallback(
    async (
      templateId: string,
      input: { name: string; body: string; purpose: SmsEditablePurpose },
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
        // 이름·본문·용도를 함께 보냄 — 서버 응답(특히 새 version·purpose)이 진실임
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

      // 마지막 활성 템플릿을 전역으로 막지 않음 — 활성 기본은 용도(purpose)별로 하나 유지되고,
      // 그 보호는 서버가(그리고 현재 기본은 SMS_DEFAULT_TEMPLATE_REASSIGN_REQUIRED 로) 담당함
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
        // 서버 결과를 그대로 반영함: 하드 삭제면 행을 빼고, 보관이면 내려온 inactive 행으로 교체함
        // (active 목록에서 저절로 빠짐). 응답 모양이 어긋나면 지어내지 않고 목록을 다시 읽음
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

      // 이미 기본이면 왕복하지 않음 — 서버 상태를 바꿀 게 없음
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
        // 서버가 같은 용도의 이전 기본을 동시에 내리고 version 도 올림 — 응답 한 행만 반영하면
        // 이전 기본이 stale 로 남음. 반드시 목록을 다시 읽어 진실을 통째로 갱신함
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
    pendingCreate,
    retryCreate,
    save,
    archive,
    setDefault,
    mutationError,
    clearMutationError,
  };
}
