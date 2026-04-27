"use client";

import Image from "next/image";
import { X, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { forwardRef } from "react";

// Fixed height for the nav - must match in all usages
export const NAV_HEIGHT = 56;

interface TopNavProps {
  // View state
  isLanding: boolean;
  viewMode: "landing" | "url" | "image";

  // URL input state (landing)
  landingUrlInput: string;
  onLandingUrlInputChange: (value: string) => void;
  onLandingUrlKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  landingUrlInputRef?: React.RefObject<HTMLInputElement | null>;

  // URL input state (viewing)
  urlInput: string;
  onUrlInputChange: (value: string) => void;
  onUrlKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onUrlFocus: () => void;
  onUrlBlur: () => void;
  isUrlFocused: boolean;
  urlInputRef?: React.RefObject<HTMLInputElement | null>;

  // Image state
  imageFileName?: string;

  // Author state
  authorName: string;
  onAuthorNameChange: (value: string) => void;
  nameInputRef?: React.RefObject<HTMLInputElement | null>;

  // Navigation
  onGoToLanding: () => void;
}

export const TopNav = forwardRef<HTMLElement, TopNavProps>(function TopNav(
  {
    isLanding,
    viewMode,
    landingUrlInput,
    onLandingUrlInputChange,
    onLandingUrlKeyDown,
    landingUrlInputRef,
    urlInput,
    onUrlInputChange,
    onUrlKeyDown,
    onUrlFocus,
    onUrlBlur,
    isUrlFocused,
    urlInputRef,
    imageFileName,
    authorName,
    onAuthorNameChange,
    nameInputRef,
    onGoToLanding,
  },
  ref
) {
  return (
    <header
      ref={ref}
      className="sticky top-0 z-50 flex items-center gap-4 border-b border-[#1F1F26] bg-[#0A0A0F] px-4"
      style={{ height: `${NAV_HEIGHT}px`, minHeight: `${NAV_HEIGHT}px`, maxHeight: `${NAV_HEIGHT}px` }}
    >
      {/* Logo + Badge - fixed width section */}
      <button
        onClick={isLanding ? undefined : onGoToLanding}
        className={cn(
          "flex items-center gap-2 shrink-0",
          !isLanding && "transition-opacity hover:opacity-80"
        )}
        disabled={isLanding}
      >
        <Image
          src="https://design-system.stellar.org/img/stellar.svg"
          alt="Stellar"
          width={100}
          height={26}
          className="h-[26px] w-auto invert brightness-0"
          priority
        />
        <span className="rounded-full bg-[#1A1A22] px-2.5 py-1 text-[11px] font-medium text-white">
          Quick
        </span>
      </button>

      {/* Viewing: URL Input - this section must have identical height in all states */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="mr-1 text-[13px] text-[#6B6B75]">Viewing:</span>
        {/*
          URL pill container - MUST have identical height (32px) in all states:
          - Landing: input + placeholder
          - URL mode: input + close button/placeholder
          - Image mode: icon + text + close button
        */}
        <div
          className="flex items-center gap-1 rounded-full bg-[#1A1A22] pl-3.5 pr-1.5"
          style={{ height: "32px" }}
        >
          {isLanding ? (
            // Landing: URL input
            <>
              <input
                ref={landingUrlInputRef}
                type="text"
                value={landingUrlInput}
                onChange={(e) => onLandingUrlInputChange(e.target.value)}
                onKeyDown={onLandingUrlKeyDown}
                className="min-w-[180px] max-w-[300px] bg-transparent text-[13px] text-white outline-none placeholder:text-[#6B6B75]"
                style={{ height: "20px", lineHeight: "20px" }}
                placeholder="Enter any demo URL"
              />
              {/* Fixed 26px placeholder to match close button */}
              <div className="w-[26px] h-[26px] shrink-0" />
            </>
          ) : viewMode === "url" ? (
            // URL viewing mode
            <>
              <input
                ref={urlInputRef}
                type="text"
                value={urlInput}
                onChange={(e) => onUrlInputChange(e.target.value)}
                onKeyDown={onUrlKeyDown}
                onFocus={onUrlFocus}
                onBlur={onUrlBlur}
                className={cn(
                  "min-w-[180px] max-w-[300px] bg-transparent text-[13px] text-white outline-none placeholder:text-[#6B6B75]",
                  isUrlFocused && "ring-0"
                )}
                style={{ height: "20px", lineHeight: "20px" }}
                placeholder="Enter URL..."
              />
              {urlInput ? (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onGoToLanding();
                  }}
                  className="flex items-center justify-center w-[26px] h-[26px] shrink-0 rounded-full text-[#6B6B75] transition-colors hover:bg-[#22222C] hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <div className="w-[26px] h-[26px] shrink-0" />
              )}
            </>
          ) : viewMode === "image" && imageFileName ? (
            // Image viewing mode
            <>
              <ImageIcon className="h-4 w-4 text-[#6B6B75] shrink-0" />
              <span
                className="text-[13px] text-white truncate max-w-[260px]"
                style={{ height: "20px", lineHeight: "20px" }}
              >
                {imageFileName}
              </span>
              <button
                type="button"
                onClick={onGoToLanding}
                className="flex items-center justify-center w-[26px] h-[26px] shrink-0 rounded-full text-[#6B6B75] transition-colors hover:bg-[#22222C] hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            // Loading state
            <>
              <span
                className="text-[13px] text-[#6B6B75]"
                style={{ height: "20px", lineHeight: "20px" }}
              >
                Loading...
              </span>
              <div className="w-[26px] h-[26px] shrink-0" />
            </>
          )}
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Comment as [name input] - fixed width section */}
      <div className="flex items-center gap-2 text-[13px] text-[#6B6B75] shrink-0">
        <span>Comment as</span>
        <input
          ref={isLanding ? undefined : nameInputRef}
          type="text"
          value={authorName}
          onChange={(e) => onAuthorNameChange(e.target.value)}
          className="w-32 rounded-full border-none bg-[#1A1A22] px-3.5 text-[13px] text-white outline-none placeholder:text-[#6B6B75] focus:ring-2 focus:ring-[#6E5BFF]/25"
          style={{ height: "32px", lineHeight: "32px" }}
          placeholder="Your name"
        />
      </div>
    </header>
  );
});
