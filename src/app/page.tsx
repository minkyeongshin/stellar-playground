"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Types
interface Comment {
  id: string;
  x: number;
  y: number;
  text: string;
  author: string;
  createdAt: string;
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

// Utility: Get storage key for comments based on hostname
function getCommentsStorageKey(url: string): string {
  const hostname = getHostname(url);
  return `stellar-quick-comments:${hostname}`;
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

// Utility: Generate unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Comment Pin Component
function CommentPin({
  comment,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
}: {
  comment: Comment;
  isSelected: boolean;
  onSelect: (id: string | null) => void;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);

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
        left: `${comment.x}%`,
        top: `${comment.y}%`,
        transform: "translate(-50%, -50%)",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Popover open={isSelected} onOpenChange={handlePopoverChange}>
        <PopoverTrigger
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full bg-purple-600 text-xs shadow-lg transition-all duration-200",
            isSelected
              ? "scale-125 shadow-purple-400/70 ring-4 ring-purple-400/50"
              : "shadow-purple-500/50 hover:scale-110"
          )}
          style={{
            animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
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

      {/* Hover Tooltip */}
      {isHovered && !isSelected && (
        <div
          className="pointer-events-none absolute left-1/2 bottom-full mb-2 z-50"
          style={{ transform: "translateX(-50%)" }}
        >
          <div className="max-w-xs rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-white backdrop-blur-md shadow-lg">
            <p className="text-sm">{comment.text}</p>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-300">
              <span>{comment.author}</span>
              <span>·</span>
              <span>{formatRelativeTime(comment.createdAt)}</span>
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
  const [nameError, setNameError] = useState(false);
  const [newCommentPos, setNewCommentPos] = useState<{ x: number; y: number } | null>(null);
  const [newCommentText, setNewCommentText] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const [isUrlFocused, setIsUrlFocused] = useState(false);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);

  // Sidebar is open when in comment mode OR a pin is selected
  const isSidebarOpen = mode === "comment" || selectedPinId !== null;

  // Check if name is valid (non-empty, non-whitespace)
  const isNameValid = authorName.trim().length > 0;

  const containerRef = useRef<HTMLDivElement>(null);
  const newCommentInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const authorNameRef = useRef<HTMLInputElement>(null);

  // Load comments for a specific URL from localStorage
  const loadCommentsForUrl = useCallback((url: string): Comment[] => {
    const key = getCommentsStorageKey(url);
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  }, []);

  // Save comments for a specific URL to localStorage
  const saveCommentsForUrl = useCallback((url: string, commentsToSave: Comment[]) => {
    const key = getCommentsStorageKey(url);
    localStorage.setItem(key, JSON.stringify(commentsToSave));
  }, []);

  // Load from localStorage on mount
  useEffect(() => {
    // Load saved URL
    const savedUrl = localStorage.getItem(URL_KEY);
    const initialUrl = savedUrl || DEFAULT_URL;
    setCurrentUrl(initialUrl);
    setUrlInput(getDisplayUrl(initialUrl));

    // Load comments for the initial URL
    const savedComments = loadCommentsForUrl(initialUrl);
    setComments(savedComments);

    // Load author name (global)
    const savedAuthor = localStorage.getItem(AUTHOR_KEY);
    if (savedAuthor) {
      setAuthorName(savedAuthor);
    }

    setIsHydrated(true);
  }, [loadCommentsForUrl]);

  // Save comments to localStorage when they change
  useEffect(() => {
    if (isHydrated) {
      saveCommentsForUrl(currentUrl, comments);
    }
  }, [comments, currentUrl, isHydrated, saveCommentsForUrl]);

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

  // Clear name error when name becomes valid
  useEffect(() => {
    if (isNameValid && nameError) {
      setNameError(false);
    }
  }, [isNameValid, nameError]);

  // Handle Escape key to clear pin selection
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedPinId !== null) {
        setSelectedPinId(null);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [selectedPinId]);

  // Navigate to a new URL
  const navigateToUrl = useCallback((newUrl: string) => {
    const normalizedUrl = normalizeUrl(newUrl);

    if (normalizedUrl === currentUrl) {
      setUrlInput(getDisplayUrl(currentUrl));
      return;
    }

    // Save current comments before switching
    if (isHydrated) {
      saveCommentsForUrl(currentUrl, comments);
    }

    // Load comments for new URL
    const newComments = loadCommentsForUrl(normalizedUrl);

    // Update state
    setCurrentUrl(normalizedUrl);
    setUrlInput(getDisplayUrl(normalizedUrl));
    setComments(newComments);
    setIframeError(false);
    setNewCommentPos(null);
  }, [currentUrl, comments, isHydrated, loadCommentsForUrl, saveCommentsForUrl]);

  // Handle URL input key events
  const handleUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      navigateToUrl(urlInput);
      urlInputRef.current?.blur();
    } else if (e.key === "Escape") {
      setUrlInput(getDisplayUrl(currentUrl));
      urlInputRef.current?.blur();
    }
  };

  // Handle URL input blur (revert without Enter)
  const handleUrlBlur = () => {
    setIsUrlFocused(false);
    setUrlInput(getDisplayUrl(currentUrl));
  };

  // Handle overlay click
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Always clear selection when clicking overlay
    if (selectedPinId !== null) {
      setSelectedPinId(null);
    }

    // In comment mode, also create new comment position
    if (mode === "comment") {
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
  const handlePostComment = () => {
    if (!newCommentPos || !newCommentText.trim()) return;

    // Validate name before posting
    if (!isNameValid) {
      setNameError(true);
      authorNameRef.current?.focus();
      return;
    }

    const newComment: Comment = {
      id: generateId(),
      x: newCommentPos.x,
      y: newCommentPos.y,
      text: newCommentText.trim(),
      author: authorName.trim(),
      createdAt: new Date().toISOString(),
    };

    setComments((prev) => [...prev, newComment]);
    setNewCommentPos(null);
    setNewCommentText("");
  };

  // Cancel new comment
  const handleCancelNewComment = () => {
    setNewCommentPos(null);
    setNewCommentText("");
  };

  // Edit comment
  const handleEditComment = (id: string, text: string) => {
    setComments((prev) =>
      prev.map((c) => (c.id === id ? { ...c, text } : c))
    );
  };

  // Delete comment
  const handleDeleteComment = (id: string) => {
    setComments((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <div className="min-h-full">
      {/* Header - Sticky */}
      <header className="sticky top-0 z-50 flex flex-wrap items-center gap-4 border-b border-white/10 bg-slate-950/95 px-4 py-3 backdrop-blur-md">
        {/* Logo */}
        <Image
          src="https://design-system.stellar.org/img/stellar.svg"
          alt="Stellar"
          width={100}
          height={26}
          className="h-[26px] w-auto invert brightness-0"
          priority
        />

        {/* Editable URL Input */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Viewing:</span>
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
              "min-w-[200px] max-w-[400px] px-2 py-1 rounded",
              isUrlFocused
                ? "border border-purple-500/50 ring-2 ring-purple-500/20 bg-white/5"
                : "border border-transparent hover:bg-white/5"
            )}
            placeholder="Enter URL..."
          />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Author Input */}
        <div className="flex items-center gap-2">
          <label htmlFor="author-name" className="text-sm text-slate-400">
            Name:
          </label>
          <Input
            ref={authorNameRef}
            id="author-name"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            className={cn(
              "h-7 w-40 px-2 text-sm text-white placeholder:text-slate-500",
              nameError
                ? "border-red-500 bg-red-500/5 focus-visible:border-red-500 focus-visible:ring-red-500/30"
                : "border-white/20 bg-white/10 focus-visible:border-purple-500 focus-visible:ring-purple-500/30"
            )}
            placeholder="Enter your name"
          />
        </div>

        {/* Comment Mode Toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (mode === "comment") {
              setMode("browse");
            } else {
              // Validate name before entering comment mode
              if (!isNameValid) {
                setNameError(true);
                authorNameRef.current?.focus();
                return;
              }
              setMode("comment");
            }
          }}
          className={cn(
            "text-sm transition-all",
            mode === "comment"
              ? "bg-purple-600 text-white shadow-lg shadow-purple-500/30 hover:bg-purple-600 hover:text-white"
              : "text-slate-400 hover:bg-slate-700 hover:text-white"
          )}
        >
          💬 Comment{comments.length > 0 ? ` (${comments.length})` : ""}
        </Button>
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
          />

          {/* Existing Comment Pins */}
          {comments.map((comment) => (
            <CommentPin
              key={comment.id}
              comment={comment}
              isSelected={selectedPinId === comment.id}
              onSelect={setSelectedPinId}
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
                  }}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Sidebar Content */}
              <div className="flex-1 overflow-y-auto">
                {comments.length === 0 ? (
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
                          className={cn(
                            "px-4 py-3 cursor-pointer transition-colors",
                            selectedPinId === comment.id
                              ? "bg-purple-500/10 border-l-2 border-purple-500"
                              : "hover:bg-white/10 border-l-2 border-transparent"
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
