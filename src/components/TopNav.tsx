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
    authorName,
    setAuthorName,
    landingUrlInputRef,
    urlInputRef,
    nameInputRef,
    onLandingUrlKeyDown,
    onUrlKeyDown,
    onUrlBlur,
    onGoToLanding,
  } = useNav();

  const isLanding = viewMode === "landing";

  return (
    <header
      className="sticky top-0 z-50 flex items-center gap-4 border-b border-[#1F1F26] bg-[#0A0A0F]"
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
          className="w-auto invert brightness-0"
          style={{ height: "26px" }}
          priority
        />
        <span
          className="rounded-full bg-[#1A1A22] text-[11px] font-medium text-white"
          style={{ padding: "4px 10px", lineHeight: "1" }}
        >
          Quick
        </span>
      </button>

      {/* Viewing: URL Input section */}
      <div className="flex items-center gap-2 shrink-0" style={{ height: `${PILL_HEIGHT}px` }}>
        <span className="mr-1 text-[13px] text-[#6B6B75]" style={{ lineHeight: "1" }}>Viewing:</span>
        {/* URL pill - EXACT same height in all states */}
        <div
          className="flex items-center rounded-full bg-[#1A1A22]"
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
                className="bg-transparent text-[13px] text-white outline-none placeholder:text-[#6B6B75]"
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
                  "bg-transparent text-[13px] text-white outline-none placeholder:text-[#6B6B75]",
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
                  className="flex items-center justify-center shrink-0 rounded-full text-[#6B6B75] transition-colors hover:bg-[#22222C] hover:text-white"
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
              <ImageIcon style={{ width: "14px", height: "14px" }} className="text-[#6B6B75] shrink-0" />
              <span
                className="text-[13px] text-white truncate"
                style={{ maxWidth: "180px", height: "18px", lineHeight: "18px" }}
              >
                {imageFileName}
              </span>
              <button
                type="button"
                onClick={onGoToLanding}
                className="flex items-center justify-center shrink-0 rounded-full text-[#6B6B75] transition-colors hover:bg-[#22222C] hover:text-white"
                style={{ width: "20px", height: "20px" }}
              >
                <X style={{ width: "12px", height: "12px" }} />
              </button>
            </>
          ) : (
            // Loading state
            <>
              <span
                className="text-[13px] text-[#6B6B75]"
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

      {/* Comment as [name input] */}
      <div className="flex items-center gap-2 text-[13px] text-[#6B6B75] shrink-0" style={{ height: `${PILL_HEIGHT}px` }}>
        <span style={{ lineHeight: "1" }}>Comment as</span>
        <input
          ref={isLanding ? undefined : nameInputRef}
          type="text"
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          className="rounded-full border-none bg-[#1A1A22] text-[13px] text-white outline-none placeholder:text-[#6B6B75] focus:ring-2 focus:ring-[#6E5BFF]/25"
          style={{
            width: "128px",
            height: `${PILL_HEIGHT}px`,
            paddingLeft: "12px",
            paddingRight: "12px",
            lineHeight: `${PILL_HEIGHT}px`,
          }}
          placeholder="Your name"
        />
      </div>
    </header>
  );
}
