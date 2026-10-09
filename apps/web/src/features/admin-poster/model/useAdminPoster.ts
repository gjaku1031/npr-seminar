"use client";

/**
 * 관리자 포스터 관리 훅 — 현재 포스터 조회 + 교체 업로드(PUT /api/v1/admin/poster)
 *
 * 규칙(민감 데이터·멱등):
 * - object URL 은 로컬 미리보기 전용이고 교체·업로드 성공·언마운트에서 revoke 함
 *   파일/이미지/토큰을 storage 나 로그에 남기지 않음
 * - 멱등 키는 `useOperationKey` 가 소유함. 선택 파일이 바뀌면 키를 버리고(새 조작),
 *   미상 실패(네트워크·5xx)에서는 키를 유지해 같은 키로 재시도(리플레이)함
 * - 성공 시 반환된 서술자를 그대로 채택하고 선택·입력을 비운 뒤 성공을 알림
 *   실패 시 파일을 남겨 재시도할 수 있게 함
 *
 * 현재 포스터는 공개 GET(/public/poster)이 곧 게시본이므로 그대로 재사용해 읽음
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getPublicPoster,
  isAborted,
  posterFileRejectionMessage,
  posterUploadErrorMessage,
  publicPosterErrorMessage,
  uploadAdminPoster,
  useOperationKey,
  validatePosterFile,
  type PosterDescriptor,
} from "@/shared/api";

/**
 * 현재 게시 포스터 조회 상태
 */
export type AdminPosterMeta =
  | { status: "pending" }
  | { status: "empty" }
  | { status: "ready"; descriptor: PosterDescriptor }
  | { status: "error"; message: string };

/**
 * 포스터 관리 패널 상태와 동작
 */
export interface UseAdminPosterResult {
  /**
   * 현재 게시된 포스터 상태(불러오는 중·없음·있음·오류)
   */
  meta: AdminPosterMeta;

  /**
   * 다시 불러오기
   */
  reload: () => void;

  /**
   * 선택된 로컬 파일과 그 object URL 미리보기(둘 다 없으면 선택 없음)
   */
  file: File | null;

  /**
   * 선택 파일 미리보기 URL
   */
  previewUrl: string | null;

  /**
   * 업로드할 파일 선택. null 이면 선택 해제
   */
  selectFile: (file: File | null) => void;

  /**
   * 업로드 중 여부
   */
  uploading: boolean;

  /**
   * 업로드 오류 문구. 없으면 null
   */
  uploadError: string | null;

  /**
   * 업로드 성공 안내. 없으면 null
   */
  successNotice: string | null;

  /**
   * 선택 파일 업로드
   */
  upload: () => void;
}

/**
 * 포스터 조회·선택·업로드 상태를 관리하는 훅
 */
export function useAdminPoster(): UseAdminPosterResult {
  const [meta, setMeta] = useState<AdminPosterMeta>({ status: "pending" });
  const [reloadToken, setReloadToken] = useState(0);
  // 느린 이전 GET이 업로드 성공으로 채택한 최신 descriptor를 덮지 못하게 하는 요청 세대
  const metaRequestGenerationRef = useRef(0);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const opKey = useOperationKey();

  useEffect(() => {
    const controller = new AbortController();
    const generation = ++metaRequestGenerationRef.current;

    void (async () => {
      try {
        const resource = await getPublicPoster(controller.signal);
        if (controller.signal.aborted || generation !== metaRequestGenerationRef.current) return;
        setMeta(
          resource.poster
            ? { status: "ready", descriptor: resource.poster }
            : { status: "empty" },
        );
      } catch (caught) {
        if (
          isAborted(caught) ||
          controller.signal.aborted ||
          generation !== metaRequestGenerationRef.current
        ) return;
        setMeta({ status: "error", message: publicPosterErrorMessage(caught) });
      }
    })();

    return () => controller.abort();
  }, [reloadToken]);

  const reload = useCallback(() => {
    setMeta({ status: "pending" });
    setReloadToken((token) => token + 1);
  }, []);

  // 로컬 미리보기 object URL 을 확실히 해제함(누수·잔존 방지)
  const revokePreview = useCallback(() => {
    if (objectUrlRef.current !== null) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  // 언마운트 정리 — 남은 object URL 을 revoke 함
  useEffect(() => revokePreview, [revokePreview]);

  const selectFile = useCallback(
    (next: File | null) => {
      // 업로드 중 선택 변경은 진행 중 조작의 파일·멱등 키·미리보기 귀속을 깨뜨림
      if (uploading) return;
      setSuccessNotice(null);
      // 선택 파일이 바뀌면 새 조작임 — 이전 미상 시도의 키와 섞이지 않게 버림
      opKey.reset();
      revokePreview();

      if (next === null) {
        setFile(null);
        setPreviewUrl(null);
        setUploadError(null);
        return;
      }

      // 클라이언트 사전 검사(형식·용량) — 통과해도 최종 권위는 서버임
      const verdict = validatePosterFile(next);
      if (!verdict.ok) {
        setFile(null);
        setPreviewUrl(null);
        setUploadError(posterFileRejectionMessage(verdict.reason));
        return;
      }

      const url = URL.createObjectURL(next);
      objectUrlRef.current = url;
      setFile(next);
      setPreviewUrl(url);
      setUploadError(null);
    },
    [opKey, revokePreview, uploading],
  );

  const upload = useCallback(() => {
    if (file === null || uploading) return;
    setUploading(true);
    setUploadError(null);
    setSuccessNotice(null);

    void (async () => {
      try {
        // 미상 재시도가 같은 키로 나가도록 opKey.current() 를 씀(리플레이)
        const descriptor = await uploadAdminPoster(file, { idempotencyKey: opKey.current() });
        opKey.settle();
        // 업로드보다 먼저 시작한 현재 포스터 GET 응답은 이제 낡았음
        metaRequestGenerationRef.current += 1;
        // 성공 — 반환 서술자를 채택하고 선택·미리보기를 비움
        revokePreview();
        setFile(null);
        setPreviewUrl(null);
        setMeta({ status: "ready", descriptor });
        setSuccessNotice("포스터가 교체됐습니다.");
      } catch (caught) {
        // 확정 4xx 면 키를 버리고, 미상(네트워크·5xx)이면 키를 유지함(settle 이 판정)
        opKey.settle(caught);
        // 실패해도 파일은 남김 — 같은 파일로 재시도할 수 있게
        setUploadError(posterUploadErrorMessage(caught));
      } finally {
        setUploading(false);
      }
    })();
  }, [file, uploading, opKey, revokePreview]);

  return {
    meta,
    reload,
    file,
    previewUrl,
    selectFile,
    uploading,
    uploadError,
    successNotice,
    upload,
  };
}
