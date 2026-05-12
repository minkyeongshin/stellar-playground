"use client";

import Image from "next/image";
import { X, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNav, NAV_HEIGHT, PILL_HEIGHT } from "@/contexts/NavContext";

export { NAV_HEIGHT } from "@/contexts/NavContext";

export function TopNav() {
  const {
    viewMode,
    landingUrlInput,
    setLandingUrlInput,
    urlInput,
    setUrlInput,
    isUrlFocused,
    setIsUrlFocused,
    imageFileName,
    landingUrlInputRef,
    urlInputRef,
    onLandingUrlKeyDown,
    onUrlKeyDown,
    onUrlBlur,
    onGoToLanding,
  } = useNav();

  const isLanding = viewMode === "landing";

  return (
    <header
      className="sticky top-0 z-50 flex items-center gap-4 border-b border-[#E5E7EB] bg-white"
      style={{
        height: `${NAV_HEIGHT}px`,
        minHeight: `${NAV_HEIGHT}px`,
        maxHeight: `${NAV_HEIGHT}px`,
        paddingLeft: "16px",
        paddingRight: "16px",
      }}
    >
      {/* Logo + Badge - fixed dimensions */}
      <button
        onClick={isLanding ? undefined : onGoToLanding}
        className={cn(
          "flex items-center gap-2 shrink-0",
          !isLanding && "transition-opacity hover:opacity-80"
        )}
        disabled={isLanding}
        style={{ height: `${PILL_HEIGHT}px` }}
      >
        <Image
          src="https://design-system.stellar.org/img/stellar.svg"
          alt="Stellar"
          width={100}
          height={26}
          className="w-auto"
          style={{ height: "26px" }}
          priority
        />
        <span
          className="rounded-full bg-[#F3F4F6] text-[11px] font-medium text-[#6B7280]"
          style={{ padding: "4px 10px", lineHeight: "1" }}
        >
          Quick
        </span>
      </button>

      {/* Viewing: URL Input section */}
      <div className="flex items-center gap-2 shrink-0" style={{ height: `${PILL_HEIGHT}px` }}>
        <span className="mr-1 text-[13px] text-[#9CA3AF]" style={{ lineHeight: "1" }}>Viewing:</span>
        {/* URL pill - EXACT same height in all states */}
        <div
          className="flex items-center rounded-full bg-[#F3F4F6]"
          style={{
            height: `${PILL_HEIGHT}px`,
            paddingLeft: "12px",
            paddingRight: "4px",
            gap: "4px",
          }}
        >
          {isLanding ? (
            // Landing: URL input
            <>
              <input
                ref={landingUrlInputRef}
                type="text"
                value={landingUrlInput}
                onChange={(e) => setLandingUrlInput(e.target.value)}
                onKeyDown={onLandingUrlKeyDown}
                className="bg-transparent text-[13px] text-[#1F2937] outline-none placeholder:text-[#9CA3AF]"
                style={{ width: "200px", height: "18px", lineHeight: "18px" }}
                placeholder="Enter any demo URL"
              />
              {/* Placeholder to match close button width */}
              <div style={{ width: "20px", height: "20px" }} className="shrink-0" />
            </>
          ) : viewMode === "url" ? (
            // URL viewing mode
            <>
              <input
                ref={urlInputRef}
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={onUrlKeyDown}
                onFocus={() => setIsUrlFocused(true)}
                onBlur={onUrlBlur}
                className={cn(
                  "bg-transparent text-[13px] text-[#1F2937] outline-none placeholder:text-[#9CA3AF]",
                  isUrlFocused && "ring-0"
                )}
                style={{ width: "200px", height: "18px", lineHeight: "18px" }}
                placeholder="Enter URL..."
              />
              {urlInput ? (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onGoToLanding();
                  }}
                  className="flex items-center justify-center shrink-0 rounded-full text-[#9CA3AF] transition-colors hover:bg-[#E5E7EB] hover:text-[#1F2937]"
                  style={{ width: "20px", height: "20px" }}
                >
                  <X style={{ width: "12px", height: "12px" }} />
                </button>
              ) : (
                <div style={{ width: "20px", height: "20px" }} className="shrink-0" />
              )}
            </>
          ) : viewMode === "image" && imageFileName ? (
            // Image viewing mode
            <>
              <ImageIcon style={{ width: "14px", height: "14px" }} className="text-[#9CA3AF] shrink-0" />
              <span
                className="text-[13px] text-[#1F2937] truncate"
                style={{ maxWidth: "180px", height: "18px", lineHeight: "18px" }}
              >
                {imageFileName}
              </span>
              <button
                type="button"
                onClick={onGoToLanding}
                className="flex items-center justify-center shrink-0 rounded-full text-[#9CA3AF] transition-colors hover:bg-[#E5E7EB] hover:text-[#1F2937]"
                style={{ width: "20px", height: "20px" }}
              >
                <X style={{ width: "12px", height: "12px" }} />
              </button>
            </>
          ) : (
            // Loading state
            <>
              <span
                className="text-[13px] text-[#9CA3AF]"
                style={{ height: "18px", lineHeight: "18px" }}
              >
                Loading...
              </span>
              <div style={{ width: "20px", height: "20px" }} className="shrink-0" />
            </>
          )}
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />
    </header>
  );
}
