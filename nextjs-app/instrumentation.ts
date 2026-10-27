import { logs } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if ((!projectToken || !host) && process.env.NODE_ENV === "development") {
  const missingVariable = !projectToken
    ? "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN"
    : "NEXT_PUBLIC_POSTHOG_HOST";

  throw new Error(
    `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
  );
}

export const posthogLogProvider =
  projectToken && host
    ? new LoggerProvider({
        resource: resourceFromAttributes({
          "service.name": "aurelienlouvel-space",
        }),
        processors: [
          new BatchLogRecordProcessor({
            exporter: new OTLPLogExporter({
              url: new URL("/i/v1/logs", host).toString(),
              headers: {
                Authorization: `Bearer ${projectToken}`,
                "Content-Type": "application/json",
              },
            }),
          }),
        ],
      })
    : null;

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && posthogLogProvider) {
    logs.setGlobalLoggerProvider(posthogLogProvider);
  }
}

function getDistinctId(cookie: string | string[] | undefined) {
  const cookieString = Array.isArray(cookie) ? cookie.join("; ") : cookie;
  const posthogCookie = cookieString?.match(/ph_phc_.*?_posthog=([^;]+)/)?.[1];

  if (!posthogCookie) return undefined;

  try {
    const data = JSON.parse(decodeURIComponent(posthogCookie));
    return typeof data.distinct_id === "string" ? data.distinct_id : undefined;
  } catch {
    return undefined;
  }
}

export async function onRequestError(
  error: Error,
  request: { headers: { cookie?: string | string[] } },
) {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !projectToken || !host) return;

  const { PostHog } = await import("posthog-node");
  const posthog = new PostHog(projectToken, {
    host,
    flushAt: 1,
    flushInterval: 0,
    enableExceptionAutocapture: true,
  });

  try {
    await posthog.captureException(error, getDistinctId(request.headers.cookie));
  } finally {
    await posthog.shutdown();
  }
}
