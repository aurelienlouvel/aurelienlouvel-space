import { SeverityNumber } from "@opentelemetry/api-logs";
import { after, NextResponse } from "next/server";
import { posthogLogProvider } from "../../../../../instrumentation";
import { client } from "@/sanity/client";
import { artifactDetailQuery, type ArtifactDetail } from "@/sanity/queries";

export const revalidate = 60;

const posthogLogger = posthogLogProvider?.getLogger("posthog-artifact-api");

function flushPosthogLogs() {
  const provider = posthogLogProvider;
  if (provider) {
    after(async () => {
      await provider.forceFlush();
    });
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!slug) {
    posthogLogger?.emit({
      body: "artifact_detail_request_rejected",
      severityNumber: SeverityNumber.WARN,
      attributes: { route: "/api/artifacts/[slug]", reason: "missing_slug" },
    });
    flushPosthogLogs();
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  try {
    const artifact = await client.fetch<ArtifactDetail | null>(
      artifactDetailQuery,
      { slug },
    );

    if (!artifact) {
      posthogLogger?.emit({
        body: "artifact_detail_not_found",
        severityNumber: SeverityNumber.INFO,
        attributes: { route: "/api/artifacts/[slug]" },
      });
      flushPosthogLogs();
      return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
    }

    posthogLogger?.emit({
      body: "artifact_detail_served",
      severityNumber: SeverityNumber.INFO,
      attributes: { route: "/api/artifacts/[slug]" },
    });
    flushPosthogLogs();
    return NextResponse.json(artifact, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("Error fetching artifact detail:", error);
    posthogLogger?.emit({
      body: "artifact_detail_fetch_failed",
      severityNumber: SeverityNumber.ERROR,
      attributes: { route: "/api/artifacts/[slug]" },
    });
    flushPosthogLogs();
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
