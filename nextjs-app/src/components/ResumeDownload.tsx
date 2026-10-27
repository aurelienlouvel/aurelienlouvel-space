"use client";

import posthog from "posthog-js";

export function ResumeDownload() {
  return (
    <a
      href="/aurelien-louvel-resume-en.pdf"
      download
      onClick={() =>
        posthog.capture("resume_downloaded", { resume_language: "en" })
      }
      className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-base text-stone-400 transition-all -rotate-1 hover:scale-[1.04] hover:-rotate-3 hover:bg-stone-50 hover:text-stone-800"
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 13 13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6.5 1v8M3.5 6.5l3 3 3-3M1.5 11.5h10" />
      </svg>
      download my resume
    </a>
  );
}
