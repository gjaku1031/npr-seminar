import { applyDecorators, Header } from "@nestjs/common";

export function SensitiveResponse(): MethodDecorator {
  return applyDecorators(
    Header("Cache-Control", "private, no-store"),
    Header("Pragma", "no-cache"),
  );
}
