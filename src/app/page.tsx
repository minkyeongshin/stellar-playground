"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

// Types
interface Comment {
  id: string;
  url: string;
  x: number;
  y: number;
  text: string;
  author: string;
  createdAt: string;
  resolved: boolean;
  containerWidth?: number; // Width of container when pin was placed (for position anchoring)
}

type Mode = "browse" | "comment";

// Constants
const AUTHOR_KEY = "stellar-author-name";
const URL_KEY = "stellar-current-url";
const DEFAULT_URL = "https://stellarskills-git-main-minkyeongshins-projects.vercel.app";

// Utility: Get hostname from URL
function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// Utility: Display URL without protocol
function getDisplayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

// Utility: Normalize URL (add https:// if missing)
function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return DEFAULT_URL;
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

// Utility: Format relative time
function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${diffDay}d ago`;
}

// Utility: Update browser URL with query parameter
function updateBrowserUrl(viewingUrl: string | null) {
  const url = new URL(window.location.href);
  if (viewingUrl) {
    url.searchParams.set("url", encodeURIComponent(viewingUrl));
  } else {
    url.searchParams.delete("url");
  }
  window.history.replaceState({}, "", url.toString());
}

// Utility: Get URL from query parameter
function getUrlFromQueryParam(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const urlParam = params.get("url");
  if (urlParam) {
    try {
      return decodeURIComponent(urlParam);
    } catch {
      return urlParam;
    }
  }
  return null;
}

// Comment Pin Component
function CommentPin({
  comment,
  isSelected,
  isHighlighted,
  isSidebarOpen,
  currentContainerWidth,
  onSelect,
  onHover,
  onEdit,
  onDelete,
}: {
  comment: Comment;
  isSelected: boolean;
  isHighlighted: boolean;
  isSidebarOpen: boolean;
  currentContainerWidth: number;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}) {
  // Calculate adjusted x position to keep pin anchored when container resizes
  // If comment has stored containerWidth, use it to calculate the absolute pixel position
  // then convert to percentage of current container width
  const adjustedX = comment.containerWidth && currentContainerWidth > 0
    ? (comment.x * comment.containerWidth / currentContainerWidth)
    : comment.x;
  const [isLocalHover, setIsLocalHover] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);

  // Show hover tooltip only when sidebar is closed
  const showHoverTooltip = isLocalHover && !isSelected && !isSidebarOpen;

  const handleSaveEdit = () => {
    if (editText.trim()) {
      onEdit(comment.id, editText.trim());
      setIsEditing(false);
    }
  };

  const handlePopoverChange = (open: boolean) => {
    if (open) {
      onSelect(comment.id);
    } else {
      onSelect(null);
      setIsEditing(false);
    }
  };

  return (
    <div
      className="pointer-events-auto absolute z-10"
      style={{
        left: `${adjustedX}%`,
        top: `${comment.y}%`,
        transform: "translate(-50%, -50%)",
      }}
      onMouseEnter={() => {
        setIsLocalHover(true);
        onHover(comment.id);
      }}
      onMouseLeave={() => {
        setIsLocalHover(false);
        onHover(null);
      }}
    >
      <Popover open={isSelected} onOpenChange={handlePopoverChange}>
        <PopoverTrigger
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full bg-purple-600 text-xs shadow-lg transition-all duration-200",
            isSelected
              ? "scale-125 shadow-purple-400/70 ring-4 ring-purple-400/50"
              : isHighlighted
                ? "scale-110 shadow-purple-400/60 ring-2 ring-purple-400/40"
                : "shadow-purple-500/50 hover:scale-110"
          )}
          style={{
            animation: isHighlighted ? "none" : "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
          }}
        >
          💬
        </PopoverTrigger>
        <PopoverContent
          side="right"
          className="w-64 border-white/10 bg-slate-900/95 p-3 backdrop-blur-md"
        >
          {isEditing ? (
            <div className="space-y-2">
              <Input
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="border-white/20 bg-white/10 text-white"
                placeholder="Edit comment..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEdit();
                  if (e.key === "Escape") setIsEditing(false);
                }}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                  className="bg-purple-600 text-white hover:bg-purple-700"
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsEditing(false)}
                  className="text-slate-400 hover:text-white"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-sm text-white">{comment.text}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                  <span>{comment.author}</span>
                  <span>·</span>
                  <span>{formatRelativeTime(comment.createdAt)}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    onDelete(comment.id);
                    onSelect(null);
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Hover Tooltip - only shown when sidebar is closed */}
      {showHoverTooltip && (
        <div
          className="pointer-events-none absolute left-1/2 bottom-full mb-3 z-50"
          style={{ transform: "translateX(-50%)" }}
        >
          <div className="relative min-w-[260px] max-w-[340px] rounded-xl border border-white/10 bg-slate-900 p-4 shadow-2xl">
            <p className="text-sm leading-relaxed text-white whitespace-pre-wrap">
              {comment.text}
            </p>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
              <span className="font-medium text-slate-400">{comment.author}</span>
              <span>·</span>
              <span>{formatRelativeTime(comment.createdAt)}</span>
            </div>
            {/* Arrow pointing down to pin */}
            <div className="absolute left-1/2 -bottom-2 -translate-x-1/2">
              <div className="h-3 w-3 rotate-45 border-b border-r border-white/10 bg-slate-900" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  // State
  const [currentUrl, setCurrentUrl] = useState(DEFAULT_URL);
  const [urlInput, setUrlInput] = useState(getDisplayUrl(DEFAULT_URL));
  const [comments, setComments] = useState<Comment[]>([]);
  const [mode, setMode] = useState<Mode>("browse");
  const [authorName, setAuthorName] = useState("");
  const [newCommentPos, setNewCommentPos] = useState<{ x: number; y: number } | null>(null);
  const [newCommentText, setNewCommentText] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const [isUrlFocused, setIsUrlFocused] = useState(false);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  // Sidebar is open when in comment mode OR a pin is selected
  const isSidebarOpen = mode === "comment" || selectedPinId !== null;

  // Reference width for pin positioning (sidebar-open width as baseline)
  // This ensures pins stay anchored when sidebar toggles
  const SIDEBAR_WIDTH = 320;

  // Check if name is valid (non-empty, non-whitespace)
  const isNameValid = authorName.trim().length > 0;

  const containerRef = useRef<HTMLDivElement>(null);
  const newCommentInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const isUrlCommittedRef = useRef(false);

  // Disable browser's automatic scroll restoration
  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  // Track container width for pin positioning
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => {
      setContainerWidth(container.offsetWidth);
    };

    // Initial measurement
    updateWidth();

    // Track resize
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  // Load initial state on mount (prioritize URL query param)
  useEffect(() => {
    // Check for URL in query parameter first
    const queryUrl = getUrlFromQueryParam();
    let initialUrl: string;

    if (queryUrl) {
      // Use query param URL (normalize it)
      initialUrl = normalizeUrl(queryUrl);
    } else {
      // Fall back to localStorage or default
      const savedUrl = localStorage.getItem(URL_KEY);
      initialUrl = savedUrl || DEFAULT_URL;
    }

    setCurrentUrl(initialUrl);
    setUrlInput(getDisplayUrl(initialUrl));

    // Update browser URL to reflect the current viewing URL
    updateBrowserUrl(getDisplayUrl(initialUrl));

    // Load author name (global)
    const savedAuthor = localStorage.getItem(AUTHOR_KEY);
    if (savedAuthor) {
      setAuthorName(savedAuthor);
    }

    setIsHydrated(true);
  }, []);

  // Subscribe to Firestore comments for the current URL (realtime)
  useEffect(() => {
    if (!isHydrated) return;

    const hostname = getHostname(currentUrl);
    setIsLoadingComments(true);

    // Query comments where url matches current hostname
    const commentsQuery = query(
      collection(db, "comments"),
      where("url", "==", hostname)
    );

    // Subscribe to realtime updates
    const unsubscribe = onSnapshot(
      commentsQuery,
      (snapshot) => {
        const newComments: Comment[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            url: data.url,
            x: data.x,
            y: data.y,
            text: data.text,
            author: data.author,
            createdAt: data.createdAt instanceof Timestamp
              ? data.createdAt.toDate().toISOString()
              : data.createdAt || new Date().toISOString(),
            resolved: data.resolved || false,
            containerWidth: data.containerWidth,
          };
        });
        setComments(newComments);
        setIsLoadingComments(false);
      },
      (error) => {
        console.error("Error fetching comments:", error);
        setIsLoadingComments(false);
      }
    );

    // Cleanup subscription on unmount or URL change
    return () => unsubscribe();
  }, [isHydrated, currentUrl]);

  // Scroll to top when URL changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentUrl]);

  // Save current URL to localStorage
  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem(URL_KEY, currentUrl);
    }
  }, [currentUrl, isHydrated]);

  // Save author name to localStorage (global)
  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem(AUTHOR_KEY, authorName);
    }
  }, [authorName, isHydrated]);

  // Focus new comment input when popup appears
  useEffect(() => {
    if (newCommentPos && newCommentInputRef.current) {
      newCommentInputRef.current.focus();
    }
  }, [newCommentPos]);

  // Handle Escape key to clear pin selection and close sidebar
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;

      // Don't handle if focused on input, textarea, or contenteditable
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Clear pin selection first, then close sidebar
      if (selectedPinId !== null) {
        setSelectedPinId(null);
      } else if (mode === "comment") {
        setMode("browse");
        setNewCommentPos(null);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [selectedPinId, mode]);

  // Handle "C" key to toggle comment mode
  useEffect(() => {
    const handleToggleComment = (e: KeyboardEvent) => {
      // Ignore if typing in an input, textarea, or contenteditable
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === "c" || e.key === "C") {
        if (mode === "comment") {
          setMode("browse");
          setNewCommentPos(null);
        } else {
          setMode("comment");
        }
      }
    };

    window.addEventListener("keydown", handleToggleComment);
    return () => window.removeEventListener("keydown", handleToggleComment);
  }, [mode]);

  // Navigate to a new URL
  const navigateToUrl = (newUrl: string) => {
    const normalizedUrl = normalizeUrl(newUrl);

    if (normalizedUrl === currentUrl) {
      setUrlInput(getDisplayUrl(currentUrl));
      return;
    }

    // Update state - Firestore subscription will handle loading comments
    setCurrentUrl(normalizedUrl);
    setUrlInput(getDisplayUrl(normalizedUrl));
    setIframeError(false);
    setNewCommentPos(null);
    setSelectedPinId(null);

    // Update browser URL with query parameter
    updateBrowserUrl(getDisplayUrl(normalizedUrl));
  };

  // Handle URL input key events
  const handleUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      isUrlCommittedRef.current = true;
      navigateToUrl(urlInput);
      urlInputRef.current?.blur();
    } else if (e.key === "Escape") {
      const displayUrl = getDisplayUrl(currentUrl);
      if (urlInput !== displayUrl) {
        setUrlInput(displayUrl);
      }
      urlInputRef.current?.blur();
    }
  };

  // Handle URL input blur (revert to currentUrl if not committed)
  const handleUrlBlur = () => {
    setIsUrlFocused(false);
    // Skip revert if we just committed via Enter
    if (isUrlCommittedRef.current) {
      isUrlCommittedRef.current = false;
      return;
    }
    setUrlInput(getDisplayUrl(currentUrl));
  };

  // Focus name input when validation fails
  const focusNameInput = () => {
    nameInputRef.current?.focus();
  };

  // Handle overlay click
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Always clear selection when clicking overlay
    if (selectedPinId !== null) {
      setSelectedPinId(null);
    }

    // In comment mode, also create new comment position
    if (mode === "comment") {
      // Validate name before placing a pin
      if (!isNameValid) {
        focusNameInput();
        return;
      }

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      setNewCommentPos({ x, y });
      setNewCommentText("");
    }
  };

  // Post new comment
  const handlePostComment = async () => {
    if (!newCommentPos || !newCommentText.trim()) return;

    // Validate name before posting
    if (!isNameValid) {
      focusNameInput();
      return;
    }

    try {
      const hostname = getHostname(currentUrl);
      await addDoc(collection(db, "comments"), {
        url: hostname,
        x: newCommentPos.x,
        y: newCommentPos.y,
        text: newCommentText.trim(),
        author: authorName.trim(),
        createdAt: serverTimestamp(),
        resolved: false,
        containerWidth: containerWidth,
      });
      // The onSnapshot listener will automatically update the UI
      setNewCommentPos(null);
      setNewCommentText("");
    } catch (error) {
      console.error("Error adding comment:", error);
    }
  };

  // Cancel new comment
  const handleCancelNewComment = () => {
    setNewCommentPos(null);
    setNewCommentText("");
  };

  // Edit comment
  const handleEditComment = async (id: string, text: string) => {
    try {
      await updateDoc(doc(db, "comments", id), { text });
      // The onSnapshot listener will automatically update the UI
    } catch (error) {
      console.error("Error editing comment:", error);
    }
  };

  // Delete comment
  const handleDeleteComment = async (id: string) => {
    try {
      await deleteDoc(doc(db, "comments", id));
      // The onSnapshot listener will automatically update the UI
    } catch (error) {
      console.error("Error deleting comment:", error);
    }
  };

  return (
    <div className="min-h-full">
      {/* Header - Sticky */}
      <header className="sticky top-0 z-50 flex flex-wrap items-center gap-4 border-b border-white/10 bg-slate-950/95 px-4 py-3 backdrop-blur-md">
        {/* Logo + Badge */}
        <div className="flex items-center gap-2">
          <Image
            src="https://design-system.stellar.org/img/stellar.svg"
            alt="Stellar"
            width={100}
            height={26}
            className="h-[26px] w-auto invert brightness-0"
            priority
          />
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-300">
            Quick
          </span>
        </div>

        {/* Editable URL Input */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Viewing:</span>
          <div className="relative">
            <input
              ref={urlInputRef}
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={handleUrlKeyDown}
              onFocus={() => setIsUrlFocused(true)}
              onBlur={handleUrlBlur}
              className={cn(
                "bg-transparent text-sm text-slate-300 outline-none transition-all",
                "min-w-[200px] max-w-[400px] py-1 pl-2 pr-7 rounded",
                isUrlFocused
                  ? "border border-purple-500/50 ring-2 ring-purple-500/20 bg-white/5"
                  : "border border-transparent hover:bg-white/5"
              )}
              placeholder="Enter URL..."
            />
            {urlInput && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setUrlInput("");
                  // Clear the query parameter when URL is cleared
                  updateBrowserUrl(null);
                }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-500 hover:text-white transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Comment as [name input] */}
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span>Comment as</span>
          <input
            ref={nameInputRef}
            type="text"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            className="w-32 rounded border border-white/20 bg-white/5 px-2 py-1 text-sm text-white outline-none transition-all placeholder:text-slate-500 focus:border-purple-500/50 focus:bg-white/10"
            placeholder="Your name"
          />
        </div>

        {/* Comment Toggle Button */}
        <div className="relative flex items-center">
          <button
            type="button"
            onClick={() => {
              if (mode === "comment") {
                setMode("browse");
                setNewCommentPos(null);
              } else {
                setMode("comment");
              }
            }}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full border text-sm transition-all",
              mode === "comment"
                ? "border-purple-500 bg-purple-600/20 text-purple-300"
                : "border-white/30 bg-transparent text-slate-400 hover:border-white/50 hover:bg-white/10 hover:text-white"
            )}
          >
            💬
          </button>
          {comments.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-purple-600 px-1 text-[10px] font-medium text-white">
              {comments.length}
            </span>
          )}
        </div>
      </header>

      {/* Main Content Area with Sidebar */}
      <div className="flex">
        {/* Iframe Container - scrolls with page */}
        <div
          className={cn(
            "relative transition-all duration-300",
            isSidebarOpen ? "mr-80" : "mr-0"
          )}
          style={{ width: isSidebarOpen ? "calc(100% - 320px)" : "100%" }}
          ref={containerRef}
        >
          {/* Iframe or Fallback */}
          {iframeError ? (
            <div className="flex h-[500px] w-full flex-col items-center justify-center bg-slate-900 text-center">
              <div className="rounded-lg border border-white/10 bg-white/5 p-8 backdrop-blur-md">
                <div className="text-4xl mb-4">🚫</div>
                <h2 className="text-xl font-semibold text-white mb-2">
                  This site cannot be embedded
                </h2>
                <p className="text-slate-400 max-w-md">
                  Try a different URL, or open{" "}
                  <a
                    href={currentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300 underline"
                  >
                    {getDisplayUrl(currentUrl)}
                  </a>{" "}
                  in a new tab.
                </p>
              </div>
            </div>
          ) : (
            <iframe
              key={currentUrl}
              src={currentUrl}
              className="w-full border-0"
              style={{ height: "5000px" }}
              title="Target Website"
              scrolling="no"
              onError={() => setIframeError(true)}
            />
          )}

          {/* Overlay - captures clicks in comment mode OR when a pin is selected */}
          <div
            className={cn(
              "absolute inset-0",
              mode === "comment"
                ? "cursor-crosshair pointer-events-auto"
                : selectedPinId !== null
                  ? "pointer-events-auto"
                  : "pointer-events-none"
            )}
            onClick={handleOverlayClick}
            onMouseMove={(e) => {
              if (mode === "comment" && !newCommentPos) {
                setCursorPos({ x: e.clientX, y: e.clientY });
              }
            }}
            onMouseLeave={() => setCursorPos(null)}
          />

          {/* Cursor-following tooltip in comment mode */}
          {mode === "comment" && !newCommentPos && cursorPos && (
            !isNameValid ? (
              <div
                className="pointer-events-none fixed z-[100]"
                style={{
                  left: cursorPos.x + 16,
                  top: cursorPos.y + 16,
                }}
              >
                <div className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
                  Enter your name first
                </div>
              </div>
            ) : (
              <div
                className="pointer-events-none fixed z-[100]"
                style={{
                  left: cursorPos.x + 6,
                  top: cursorPos.y + 6,
                }}
              >
                <span className="text-xl">💬</span>
              </div>
            )
          )}

          {/* Existing Comment Pins */}
          {comments.map((comment) => (
            <CommentPin
              key={comment.id}
              comment={comment}
              isSelected={selectedPinId === comment.id}
              isHighlighted={hoveredPinId === comment.id}
              isSidebarOpen={isSidebarOpen}
              currentContainerWidth={containerWidth}
              onSelect={setSelectedPinId}
              onHover={setHoveredPinId}
              onEdit={handleEditComment}
              onDelete={handleDeleteComment}
            />
          ))}

          {/* New Comment Popup */}
          {newCommentPos && (
            <div
              className="pointer-events-auto absolute z-50"
              style={{
                left: `${newCommentPos.x}%`,
                top: `${newCommentPos.y}%`,
                transform: "translate(8px, -50%)",
              }}
            >
              <div className="w-64 rounded-lg border border-white/10 bg-slate-900/95 p-3 shadow-xl backdrop-blur-md">
                <Input
                  ref={newCommentInputRef}
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  className="border-white/20 bg-white/10 text-white placeholder:text-slate-500"
                  placeholder="Add a comment..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handlePostComment();
                    if (e.key === "Escape") handleCancelNewComment();
                  }}
                />
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-slate-400">
                    Posting as {authorName}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCancelNewComment}
                      className="text-slate-400 hover:text-white"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handlePostComment}
                      disabled={!newCommentText.trim()}
                      className="bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
                    >
                      Post
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Comments Sidebar - Fixed */}
        <div
          className={cn(
            "fixed right-0 top-[57px] bottom-0 flex flex-col border-l border-white/10 bg-slate-900/95 backdrop-blur-md transition-all duration-300 z-40",
            isSidebarOpen ? "w-80" : "w-0"
          )}
        >
          {isSidebarOpen && (
            <>
              {/* Sidebar Header */}
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <h2 className="text-sm font-semibold text-white">Comments</h2>
                <button
                  onClick={() => {
                    setMode("browse");
                    setSelectedPinId(null);
                    setNewCommentPos(null);
                  }}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Sidebar Content */}
              <div className="flex-1 overflow-y-auto">
                {isLoadingComments ? (
                  <div className="flex h-full items-center justify-center p-4">
                    <p className="text-center text-sm text-slate-500">
                      Loading comments...
                    </p>
                  </div>
                ) : comments.length === 0 ? (
                  <div className="flex h-full items-center justify-center p-4">
                    <p className="text-center text-sm text-slate-500">
                      No comments yet.
                      <br />
                      Switch to Comment mode to add one.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {[...comments]
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map((comment) => (
                        <div
                          key={comment.id}
                          onClick={() => setSelectedPinId(comment.id)}
                          onMouseEnter={() => setHoveredPinId(comment.id)}
                          onMouseLeave={() => setHoveredPinId(null)}
                          className={cn(
                            "px-4 py-3 cursor-pointer border-l-2 transition-colors duration-150",
                            selectedPinId === comment.id
                              ? "bg-purple-500/15 border-purple-500"
                              : hoveredPinId === comment.id
                                ? "bg-purple-500/15 border-purple-400"
                                : "hover:bg-white/5 border-transparent"
                          )}
                        >
                          <p className="text-sm text-white font-medium leading-relaxed">
                            {comment.text}
                          </p>
                          <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
                            <span>{comment.author}</span>
                            <span>·</span>
                            <span>{formatRelativeTime(comment.createdAt)}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Pulse Animation Keyframes */}
      <style jsx global>{`
        @keyframes pulse {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(168, 85, 247, 0.7);
          }
          50% {
            box-shadow: 0 0 0 8px rgba(168, 85, 247, 0);
          }
        }
      `}</style>
    </div>
  );
}
