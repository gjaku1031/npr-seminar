import { applyDecorators, Header } from "@nestjs/common";

/**
 * 개인정보 응답의 캐시 금지 헤더 지정
 *
 * Cache-Control: private, no-store와 Pragma: no-cache 설정
 */
export function SensitiveResponse(): MethodDecorator {
  return applyDecorators(
    Header("Cache-Control", "private, no-store"),
    Header("Pragma", "no-cache"),
  );
}
