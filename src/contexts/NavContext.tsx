"use client";

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";

// Exact pixel dimensions - measured from landing page nav
// These are the TARGET values that must be identical across all pages
export const NAV_HEIGHT = 52; // Total nav height including border
export const NAV_PADDING_X = 16; // px-4 = 16px
export const PILL_HEIGHT = 28; // URL pill and name input height
export const LOGO_HEIGHT = 26; // Stellar logo height

type ViewMode = "landing" | "url" | "image";

interface NavContextValue {
  // View state
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  // URL input state (landing)
  landingUrlInput: string;
  setLandingUrlInput: (value: string) => void;

  // URL input state (viewing)
  urlInput: string;
  setUrlInput: (value: string) => void;
  isUrlFocused: boolean;
  setIsUrlFocused: (focused: boolean) => void;

  // Image state
  imageFileName: string | undefined;
  setImageFileName: (name: string | undefined) => void;

  // Author state
  authorName: string;
  setAuthorName: (name: string) => void;

  // Refs
  landingUrlInputRef: React.RefObject<HTMLInputElement | null>;
  urlInputRef: React.RefObject<HTMLInputElement | null>;
  nameInputRef: React.RefObject<HTMLInputElement | null>;

  // Event handlers (set by page, called by nav)
  onLandingUrlKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  setOnLandingUrlKeyDown: (handler: (e: React.KeyboardEvent<HTMLInputElement>) => void) => void;
  onUrlKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  setOnUrlKeyDown: (handler: (e: React.KeyboardEvent<HTMLInputElement>) => void) => void;
  onUrlBlur: () => void;
  setOnUrlBlur: (handler: () => void) => void;
  onGoToLanding: () => void;
  setOnGoToLanding: (handler: () => void) => void;
}

const NavContext = createContext<NavContextValue | null>(null);

export function NavProvider({ children }: { children: ReactNode }) {
  const [viewMode, setViewMode] = useState<ViewMode>("landing");
  const [landingUrlInput, setLandingUrlInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [isUrlFocused, setIsUrlFocused] = useState(false);
  const [imageFileName, setImageFileName] = useState<string | undefined>(undefined);
  const [authorName, setAuthorName] = useState("");

  // Refs for inputs
  const landingUrlInputRef = useRef<HTMLInputElement | null>(null);
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  // Event handlers - these get set by the page component
  const [onLandingUrlKeyDown, setOnLandingUrlKeyDownState] = useState<(e: React.KeyboardEvent<HTMLInputElement>) => void>(() => () => {});
  const [onUrlKeyDown, setOnUrlKeyDownState] = useState<(e: React.KeyboardEvent<HTMLInputElement>) => void>(() => () => {});
  const [onUrlBlur, setOnUrlBlurState] = useState<() => void>(() => () => {});
  const [onGoToLanding, setOnGoToLandingState] = useState<() => void>(() => () => {});

  const setOnLandingUrlKeyDown = useCallback((handler: (e: React.KeyboardEvent<HTMLInputElement>) => void) => {
    setOnLandingUrlKeyDownState(() => handler);
  }, []);

  const setOnUrlKeyDown = useCallback((handler: (e: React.KeyboardEvent<HTMLInputElement>) => void) => {
    setOnUrlKeyDownState(() => handler);
  }, []);

  const setOnUrlBlur = useCallback((handler: () => void) => {
    setOnUrlBlurState(() => handler);
  }, []);

  const setOnGoToLanding = useCallback((handler: () => void) => {
    setOnGoToLandingState(() => handler);
  }, []);

  return (
    <NavContext.Provider
      value={{
        viewMode,
        setViewMode,
        landingUrlInput,
        setLandingUrlInput,
        urlInput,
        setUrlInput,
        isUrlFocused,
        setIsUrlFocused,
        imageFileName,
        setImageFileName,
        authorName,
        setAuthorName,
        landingUrlInputRef,
        urlInputRef,
        nameInputRef,
        onLandingUrlKeyDown,
        setOnLandingUrlKeyDown,
        onUrlKeyDown,
        setOnUrlKeyDown,
        onUrlBlur,
        setOnUrlBlur,
        onGoToLanding,
        setOnGoToLanding,
      }}
    >
      {children}
    </NavContext.Provider>
  );
}

export function useNav() {
  const context = useContext(NavContext);
  if (!context) {
    throw new Error("useNav must be used within a NavProvider");
  }
  return context;
}
