import type { Request } from "express";
import { isIP } from "node:net";
import type { AppEnvironment } from "../config/environment.js";

const HOST_PATTERN = /^(?:\[[0-9a-f:]+\]|[a-z0-9.-]+)(?::[1-9][0-9]{0,4})?$/iu;

export function effectiveRequestOrigin(request: Request, environment: AppEnvironment): string | null {
  const directHost = singleHeader(request.get("host"));
  if (directHost === null || !HOST_PATTERN.test(directHost)) return null;
  const forwardedHostHeader = request.get("x-forwarded-host");
  const forwardedProtoHeader = request.get("x-forwarded-proto");
  const forwardedForHeader = request.get("x-forwarded-for");
  const hasForwarded = forwardedHostHeader !== undefined || forwardedProtoHeader !== undefined || forwardedForHeader !== undefined;
  const remoteAddress = request.socket.remoteAddress ?? "";
  const trustedLoopback = environment.trustProxy === 1 && isLoopback(remoteAddress);
  if (hasForwarded && !trustedLoopback) return null;
  if (trustedLoopback && hasForwarded) {
    const forwardedHost = singleHeader(forwardedHostHeader);
    const forwardedProto = singleHeader(forwardedProtoHeader);
    if (forwardedHost === null || forwardedProto === null || !HOST_PATTERN.test(forwardedHost)
      || !/^(?:https|http)$/u.test(forwardedProto)) return null;
    if (forwardedForHeader !== undefined) {
      const forwardedFor = singleHeader(forwardedForHeader);
      if (forwardedFor === null || isIP(forwardedFor) === 0) return null;
    }
    return parseOrigin(`${forwardedProto}://${forwardedHost}`);
  }
  if (forwardedHostHeader !== undefined || forwardedProtoHeader !== undefined) return null;
  return parseOrigin(`${request.protocol}://${directHost}`);
}

function singleHeader(value: string | undefined): string | null {
  if (value === undefined) return null;
  const normalized = value.trim();
  return normalized === "" || normalized.includes(",") || /[\r\n]/u.test(normalized) ? null : normalized;
}

function isLoopback(address: string): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function parseOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.username === "" && parsed.password === "" && parsed.pathname === "/"
      && parsed.search === "" && parsed.hash === "" ? parsed.origin : null;
  } catch {
    return null;
  }
}
