"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { MessageCircle, X, Check, Pencil, Trash2, CheckCircle, CheckCircle2, RotateCcw, Send, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { db, storage } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from "firebase/storage";
import { useNav, NAV_HEIGHT } from "@/contexts/NavContext";

// Types
interface Comment {
  id: string;
  targetType: "url" | "image";
  targetId: string; // hostname for URLs, imageId for images
  x: number;
  y: number;
  text: string;
  author: string;
  createdAt: string;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  containerWidth?: number;
}

interface ImageDoc {
  id: string;
  storageUrl: string;
  fileName: string;
  uploadedBy: string;
  uploadedAt: string;
  width: number;
  height: number;
}

type Mode = "browse" | "comment";

// Constants
const URL_KEY = "stellar-current-url";
const DEFAULT_URL = "https://stellarskills-git-main-minkyeongshins-projects.vercel.app";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

// Feature flag to hide the floating comments button (FAB)
// Set to true to re-enable the button
const SHOW_FLOATING_COMMENTS_BUTTON = false;

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
function updateBrowserUrl(params: { url?: string | null; image?: string | null }) {
  const browserUrl = new URL(window.location.href);

  if (params.url !== undefined) {
    if (params.url) {
      browserUrl.searchParams.set("url", encodeURIComponent(params.url));
    } else {
      browserUrl.searchParams.delete("url");
    }
  }

  if (params.image !== undefined) {
    if (params.image) {
      browserUrl.searchParams.set("image", params.image);
    } else {
      browserUrl.searchParams.delete("image");
    }
  }

  window.history.replaceState({}, "", browserUrl.toString());
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

// Utility: Get image ID from query parameter
function getImageFromQueryParam(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("image");
}

// Utility: Generate unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// Reply type for local state
interface LocalReply {
  id: string;
  text: string;
  author: string;
  createdAt: string;
}

// Avatar colors based on name
function getAvatarColor(name: string): string {
  const colors = [
    "#6E5BFF", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
    "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1"
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// Comment Pin Component
function CommentPin({
  comment,
  isSelected,
  isHighlighted,
  currentAuthorName,
  onSetAuthorName,
  onSelect,
  onHover,
  onEdit,
  onDelete,
  onResolve,
  onReopen,
  onMove,
  containerRef,
}: {
  comment: Comment;
  isSelected: boolean;
  isHighlighted: boolean;
  currentAuthorName: string;
  onSetAuthorName: (name: string) => void;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onResolve: (id: string) => void;
  onReopen: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  // For URL mode: use simple percentage positioning
  // (containerWidth adjustment doesn't help for responsive iframe content)
  // For Image mode: percentage positioning works perfectly since images scale uniformly
  const adjustedX = comment.x;
  const adjustedY = comment.y;
  const [isLocalHover, setIsLocalHover] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);

  // Local replies state
  const [replies, setReplies] = useState<LocalReply[]>([]);
  const [replyText, setReplyText] = useState("");
  const [pendingReplyName, setPendingReplyName] = useState(""); // Local name input - only saved on submit
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editReplyText, setEditReplyText] = useState("");

  // Reply name edit popover state
  const [isReplyNameEditOpen, setIsReplyNameEditOpen] = useState(false);
  const [replyNameEditInput, setReplyNameEditInput] = useState("");

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [localPosition, setLocalPosition] = useState<{ x: number; y: number } | null>(null);
  const localPositionRef = useRef<{ x: number; y: number } | null>(null);
  const justDraggedRef = useRef(false);
  const pinRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const replyInputRef = useRef<HTMLInputElement>(null);
  const replyNameInputRef = useRef<HTMLInputElement>(null);
  const replyNameEditInputRef = useRef<HTMLInputElement>(null);
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    grabOffsetX: number;
    grabOffsetY: number;
    hasDragged: boolean;
  } | null>(null);

  // Keep ref in sync with state (fixes stale closure in event handlers)
  useEffect(() => {
    localPositionRef.current = localPosition;
  }, [localPosition]);

  const isResolved = comment.resolved;

  // Unified popover visibility: show on hover OR when selected
  const showPopover = (isLocalHover || isSelected) && !isDragging;
  // Expanded state: only when clicked (selected)
  const isExpanded = isSelected;

  const DRAG_THRESHOLD = 8; // px

  // Handle mouse move - detect drag threshold and update position
  const handleMouseMove = useCallback((e: MouseEvent) => {
    const state = dragStateRef.current;
    if (!state || !containerRef.current) {
      return;
    }

    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Only enter drag mode after passing threshold
    if (!state.hasDragged && distance >= DRAG_THRESHOLD) {
      state.hasDragged = true;
      setIsDragging(true);

      // Disable iframe pointer-events to prevent dead zones
      const iframe = document.querySelector("iframe");
      if (iframe) {
        iframe.style.pointerEvents = "none";
      }
    }

    if (!state.hasDragged) return; // Not yet dragging

    // Calculate new pin position based on grab offset
    const wrapperRect = containerRef.current.getBoundingClientRect();
    const newPinLeft = e.clientX - state.grabOffsetX - wrapperRect.left;
    const newPinTop = e.clientY - state.grabOffsetY - wrapperRect.top;

    // Convert to % of wrapper
    const xPercent = (newPinLeft / wrapperRect.width) * 100;
    const yPercent = (newPinTop / wrapperRect.height) * 100;

    // Clamp so pin stays within bounds (pin is ~28px)
    const pinSizeX = (28 / wrapperRect.width) * 100;
    const pinSizeY = (28 / wrapperRect.height) * 100;

    setLocalPosition({
      x: Math.max(0, Math.min(100 - pinSizeX, xPercent)),
      y: Math.max(0, Math.min(100 - pinSizeY, yPercent)),
    });
  }, [containerRef]);

  // Handle mouse up - save position or open popover
  const handleMouseUp = useCallback(() => {
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);

    // Re-enable iframe pointer-events
    const iframe = document.querySelector("iframe");
    if (iframe) {
      iframe.style.pointerEvents = "auto";
    }

    const state = dragStateRef.current;
    if (!state) {
      return;
    }

    // Read from ref to get latest position (avoids stale closure)
    const finalPosition = localPositionRef.current;

    if (state.hasDragged && finalPosition) {
      // It was a drag - save new position
      justDraggedRef.current = true;

      // Block the click event that fires after mouseup (capture phase, once)
      const blockClick = (e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
      };
      document.addEventListener("click", blockClick, { capture: true, once: true });

      onMove(comment.id, finalPosition.x, finalPosition.y);
      setIsDragging(false);
      setLocalPosition(null);
      setIsLocalHover(false);

      // Reset flag after click would have fired
      setTimeout(() => {
        justDraggedRef.current = false;
      }, 100);

      dragStateRef.current = null;
      return;
    }

    // It was a click (no movement) - toggle expanded state
    if (isSelected) {
      // Already selected, clicking again closes it
      onSelect(null);
    } else {
      onSelect(comment.id);
    }

    dragStateRef.current = null;
  }, [handleMouseMove, comment.id, onMove, onSelect, isSelected]);

  // Handle mousedown - start tracking for potential drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!pinRef.current) {
      return;
    }

    const pinRect = pinRef.current.getBoundingClientRect();
    const grabOffsetX = e.clientX - pinRect.left;
    const grabOffsetY = e.clientY - pinRect.top;

    dragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      grabOffsetX,
      grabOffsetY,
      hasDragged: false,
    };

    // Add document listeners
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [handleMouseMove, handleMouseUp]);

  // Handle Esc key to cancel drag or close expanded state
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isDragging) {
          // Cancel drag, revert to original position
          document.removeEventListener("mousemove", handleMouseMove);
          document.removeEventListener("mouseup", handleMouseUp);

          // Re-enable iframe pointer-events
          const iframe = document.querySelector("iframe");
          if (iframe) {
            iframe.style.pointerEvents = "auto";
          }

          dragStateRef.current = null;
          setIsDragging(false);
          setLocalPosition(null);
        } else if (isSelected) {
          onSelect(null);
          setIsEditing(false);
        }
      }
    };

    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isDragging, isSelected, handleMouseMove, handleMouseUp, onSelect]);

  // Handle click outside to close expanded popover
  useEffect(() => {
    if (!isSelected) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;

      // Don't close if clicking inside the popover
      if (popoverRef.current?.contains(target)) {
        return;
      }

      // Don't close if clicking the pin itself
      if (pinRef.current?.contains(target)) {
        return;
      }

      onSelect(null);
      setIsEditing(false);
    };

    // Use setTimeout to avoid the click that just selected this pin
    const timeoutId = setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [isSelected, onSelect]);

  // Reset local position when comment position changes (e.g., from Firestore update)
  useEffect(() => {
    setLocalPosition(null);
  }, [comment.x, comment.y]);

  // Current display position (local drag position or actual position)
  const displayX = isDragging && localPosition ? localPosition.x : adjustedX;
  const displayY = isDragging && localPosition ? localPosition.y : adjustedY;

  // Popover position state for viewport collision detection
  const [popoverPosition, setPopoverPosition] = useState<{
    horizontal: "left" | "right";
    vertical: "top" | "center" | "bottom";
  }>({ horizontal: "right", vertical: "center" });

  // Calculate optimal popover position based on pin location in viewport
  useEffect(() => {
    if (!showPopover || !pinRef.current) return;

    const pinRect = pinRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const popoverWidth = 360; // max-width of popover
    const popoverHeight = 300; // estimated max height
    const offset = 12; // gap between pin and popover

    // Check horizontal position
    const spaceOnRight = viewportWidth - pinRect.right - offset;
    const spaceOnLeft = pinRect.left - offset;
    const horizontal: "left" | "right" = spaceOnRight >= popoverWidth ? "right" : "left";

    // Check vertical position
    const pinCenterY = pinRect.top + pinRect.height / 2;
    const halfPopoverHeight = popoverHeight / 2;

    let vertical: "top" | "center" | "bottom" = "center";
    if (pinCenterY - halfPopoverHeight < 0) {
      // Not enough space above, align to top
      vertical = "top";
    } else if (pinCenterY + halfPopoverHeight > viewportHeight) {
      // Not enough space below, align to bottom
      vertical = "bottom";
    }

    setPopoverPosition({ horizontal, vertical });
  }, [showPopover, displayX, displayY]);

  // Pin colors: purple for active, gray for resolved
  const pinBgColor = isResolved ? "#4A4A52" : "#6E5BFF";
  const pinRingColor = isResolved ? "rgba(74,74,82,0.5)" : "rgba(110,91,255,0.5)";
  const pinHighlightShadow = isResolved
    ? "0 0 0 4px rgba(74,74,82,0.4)"
    : "0 0 0 4px rgba(110,91,255,0.4)";

  const handleSaveEdit = () => {
    if (editText.trim()) {
      onEdit(comment.id, editText.trim());
      setIsEditing(false);
    }
  };

  const handleAddReply = () => {
    if (!replyText.trim()) return;
    // Use saved name or pending name
    const nameToUse = currentAuthorName?.trim() || pendingReplyName.trim();
    if (!nameToUse) return;

    // If using pending name, save it now
    if (!currentAuthorName?.trim() && pendingReplyName.trim()) {
      onSetAuthorName(pendingReplyName.trim());
    }

    const newReply: LocalReply = {
      id: `reply-${Date.now()}`,
      text: replyText.trim(),
      author: nameToUse,
      createdAt: new Date().toISOString(),
    };
    setReplies((prev) => [...prev, newReply]);
    setReplyText("");
    setPendingReplyName(""); // Clear pending name
  };

  const handleStartEditReply = (reply: LocalReply) => {
    setEditingReplyId(reply.id);
    setEditReplyText(reply.text);
  };

  const handleSaveEditReply = () => {
    if (!editingReplyId || !editReplyText.trim()) return;
    setReplies((prev) =>
      prev.map((r) =>
        r.id === editingReplyId ? { ...r, text: editReplyText.trim() } : r
      )
    );
    setEditingReplyId(null);
    setEditReplyText("");
  };

  const handleCancelEditReply = () => {
    setEditingReplyId(null);
    setEditReplyText("");
  };

  const handleDeleteReply = (replyId: string) => {
    setReplies((prev) => prev.filter((r) => r.id !== replyId));
  };

  // Reply name edit popover handlers
  const handleOpenReplyNameEdit = () => {
    setReplyNameEditInput(currentAuthorName || "");
    setIsReplyNameEditOpen(true);
    setTimeout(() => {
      if (replyNameEditInputRef.current) {
        replyNameEditInputRef.current.focus();
        replyNameEditInputRef.current.select();
      }
    }, 0);
  };

  const handleSaveReplyNameEdit = () => {
    if (!replyNameEditInput.trim()) return;
    onSetAuthorName(replyNameEditInput.trim());
    setPendingReplyName(""); // Clear pending since we now have a saved name
    setIsReplyNameEditOpen(false);
  };

  const handleCancelReplyNameEdit = () => {
    setIsReplyNameEditOpen(false);
    setReplyNameEditInput("");
  };

  // Get author initials for avatar
  const getInitials = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  return (
    <div
      className={cn(
        "pointer-events-auto absolute",
        isDragging ? "z-[100]" : "z-10"
      )}
      style={{
        left: `${displayX}%`,
        top: `${displayY}%`,
        transform: "translate(-50%, -50%)",
        transition: isDragging ? "none" : "left 150ms ease, top 150ms ease",
        userSelect: "none",
      }}
      onMouseEnter={() => {
        if (!isDragging) {
          setIsLocalHover(true);
          onHover(comment.id);
        }
      }}
      onMouseLeave={() => {
        if (!isDragging) {
          setIsLocalHover(false);
          onHover(null);
        }
      }}
    >
      {/* Pin button - avatar(s) with speech bubble tail */}
      {(() => {
        // Calculate unique participants (most recent first for display order)
        const allAuthors = [comment.author, ...replies.map(r => r.author)];
        const uniqueParticipants = [...new Set(allAuthors)];
        const participantCount = uniqueParticipants.length;

        // For display: show most recent 2 participants
        // Front avatar = most recent participant, Back avatar = second most recent
        const recentParticipants = [...uniqueParticipants].reverse().slice(0, 2);
        const frontParticipant = recentParticipants[0] || comment.author;
        const backParticipant = recentParticipants[1];

        // Calculate width based on participant count
        const avatarSize = 28;
        const overlap = 10; // px overlap between avatars
        const badgeWidth = participantCount > 2 ? 28 : 0;
        const badgeGap = participantCount > 2 ? 2 : 0;

        let totalWidth = avatarSize; // 1 participant
        if (participantCount >= 2) {
          totalWidth = avatarSize * 2 - overlap; // 2 overlapping avatars
        }
        if (participantCount > 2) {
          totalWidth += badgeGap + badgeWidth; // + badge
        }

        // Calculate total button width based on participant count
        let totalButtonWidth = avatarSize; // 1 participant
        if (participantCount >= 2) {
          totalButtonWidth = avatarSize * 2 - overlap;
        }
        if (participantCount > 2) {
          totalButtonWidth += badgeGap + badgeWidth;
        }

        return (
          <button
            ref={pinRef}
            type="button"
            className="relative transition-all duration-150"
            style={{
              width: `${totalButtonWidth}px`,
              height: `${avatarSize}px`,
              cursor: isDragging ? "grabbing" : "grab",
              userSelect: "none",
              transform: isDragging
                ? "scale(1.05)"
                : isSelected || isHighlighted
                  ? "scale(1.05)"
                  : undefined,
              transition: isDragging ? "none" : "transform 150ms ease",
            }}
            onMouseDown={handleMouseDown}
          >
            {/* Back avatar (second participant) - plain circle, only show if 2+ participants */}
            {participantCount >= 2 && backParticipant && (
              <div
                className="absolute flex items-center justify-center rounded-full"
                style={{
                  width: `${avatarSize}px`,
                  height: `${avatarSize}px`,
                  left: `${avatarSize - overlap}px`,
                  top: 0,
                  zIndex: 1,
                  backgroundColor: getAvatarColor(backParticipant),
                  boxShadow: isLocalHover || isSelected || isHighlighted
                    ? "0 2px 8px rgba(0, 0, 0, 0.25)"
                    : "0 2px 6px rgba(0, 0, 0, 0.15)",
                }}
              >
                <span
                  className="text-[11px] font-semibold text-white"
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,0.2)" }}
                >
                  {getInitials(backParticipant)}
                </span>
              </div>
            )}

            {/* Front avatar - plain circle */}
            <div
              className="absolute flex items-center justify-center rounded-full"
              style={{
                width: `${avatarSize}px`,
                height: `${avatarSize}px`,
                left: 0,
                top: 0,
                zIndex: 2,
                backgroundColor: getAvatarColor(frontParticipant),
                boxShadow: isLocalHover || isSelected || isHighlighted
                  ? "0 2px 8px rgba(0, 0, 0, 0.25)"
                  : "0 2px 6px rgba(0, 0, 0, 0.15)",
              }}
            >
              <span
                className="text-[11px] font-semibold text-white"
                style={{ textShadow: "0 1px 2px rgba(0,0,0,0.2)" }}
              >
                {getInitials(frontParticipant)}
              </span>
            </div>

            {/* "+N" badge for 3+ participants */}
            {participantCount > 2 && (
              <div
                className="absolute flex items-center justify-center rounded-full"
                style={{
                  width: `${badgeWidth}px`,
                  height: `${avatarSize}px`,
                  left: `${avatarSize * 2 - overlap + badgeGap}px`,
                  top: 0,
                  zIndex: 1,
                  backgroundColor: "#F0F0F0",
                  boxShadow: "0 2px 6px rgba(0, 0, 0, 0.1)",
                }}
              >
                <span className="text-[11px] font-semibold text-[#333]">
                  +{participantCount - 2}
                </span>
              </div>
            )}
          </button>
        );
      })()}

      {/* Unified popover - same container for hover and click */}
      {showPopover && (
        <div
          ref={popoverRef}
          className={cn(
            "absolute z-50 rounded-2xl border border-[#E5E7EB] bg-white",
            // Horizontal positioning
            popoverPosition.horizontal === "right" ? "left-full ml-3" : "right-full mr-3",
            // Vertical positioning
            popoverPosition.vertical === "center" && "top-1/2",
            popoverPosition.vertical === "top" && "top-0",
            popoverPosition.vertical === "bottom" && "bottom-0"
          )}
          style={{
            transform: popoverPosition.vertical === "center" ? "translateY(-50%)" : undefined,
            width: "min(360px, calc(100vw - 32px))",
            maxWidth: "360px",
            boxShadow: "0 8px 30px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {isEditing ? (
            // Edit mode
            <div className="p-4 space-y-3">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2.5 text-[14px] text-[#1F2937] outline-none transition-all placeholder:text-[#9CA3AF] focus:ring-2 focus:ring-[#6E5BFF]/20 focus:border-[#6E5BFF]/30 resize-none"
                placeholder="Edit comment..."
                rows={3}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSaveEdit();
                  }
                  if (e.key === "Escape") setIsEditing(false);
                }}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setIsEditing(false)}
                  className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-[#6B7280] transition-all hover:bg-[#F3F4F6]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="rounded-lg bg-[#6E5BFF] px-4 py-1.5 text-[13px] font-medium text-white transition-all hover:bg-[#5B4AE6]"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            // View mode - consistent layout for both hover and expanded
            <div>
              {/* Main comment section */}
              <div className="p-4">
                {/* Header row: Avatar + Content + Actions */}
                <div className="flex items-start gap-3">
                  {/* Avatar - consistent size */}
                  <div
                    className="flex-shrink-0 flex items-center justify-center rounded-full text-white text-[13px] font-semibold"
                    style={{
                      width: "32px",
                      height: "32px",
                      backgroundColor: getAvatarColor(comment.author),
                    }}
                  >
                    {getInitials(comment.author)}
                  </div>

                  {/* Content area */}
                  <div className="flex-1 min-w-0">
                    {/* Author, timestamp, and actions row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-semibold text-[#1F2937]">
                          {comment.author}
                        </span>
                        <span className="text-[12px] text-[#9CA3AF]">
                          {formatRelativeTime(comment.createdAt)}
                        </span>
                      </div>

                      {/* Action icons */}
                      <div className="flex items-center gap-0.5 flex-shrink-0 -mr-1">
                        {/* Edit - only in expanded */}
                        {isExpanded && (
                          <button
                            onClick={() => setIsEditing(true)}
                            className="p-1.5 rounded-lg hover:bg-[#F3F4F6] text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {/* Resolve/Reopen - always visible */}
                        {isResolved ? (
                          <button
                            onClick={() => onReopen(comment.id)}
                            className="p-1.5 rounded-lg hover:bg-[#F3F4F6] text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
                            title="Reopen"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => onResolve(comment.id)}
                            className="p-1.5 rounded-lg hover:bg-[#DCFCE7] text-[#9CA3AF] hover:text-[#16A34A] transition-colors"
                            title="Resolve"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </button>
                        )}
                        {/* Delete - only in expanded */}
                        {isExpanded && (
                          <button
                            onClick={() => {
                              onDelete(comment.id);
                              onSelect(null);
                            }}
                            className="p-1.5 rounded-lg hover:bg-[#FEE2E2] text-[#9CA3AF] hover:text-[#DC2626] transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Comment text */}
                    <p className="mt-1.5 text-[14px] leading-[1.5] text-[#374151]">
                      {comment.text}
                    </p>

                    {/* Resolved badge */}
                    {isResolved && (
                      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#F0FDF4] px-2.5 py-1">
                        <Check className="h-3.5 w-3.5 text-[#16A34A]" />
                        <span className="text-[11px] font-medium text-[#16A34A]">Resolved</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Replies section - only in expanded state */}
              {isExpanded && replies.length > 0 && (
                <div className="border-t border-[#F3F4F6]">
                  {replies.map((reply) => {
                    const isOwnReply = reply.author === currentAuthorName;
                    const isEditingThis = editingReplyId === reply.id;

                    return (
                      <div key={reply.id} className="flex items-start gap-3 px-4 py-3 group">
                        <div
                          className="flex-shrink-0 flex items-center justify-center rounded-full text-white text-[11px] font-semibold"
                          style={{
                            width: "26px",
                            height: "26px",
                            backgroundColor: getAvatarColor(reply.author),
                          }}
                        >
                          {getInitials(reply.author)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-semibold text-[#1F2937]">
                                {reply.author}
                              </span>
                              <span className="text-[11px] text-[#9CA3AF]">
                                {formatRelativeTime(reply.createdAt)}
                              </span>
                            </div>
                            {/* Edit/Delete icons - only for own replies */}
                            {isOwnReply && !isEditingThis && (
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => handleStartEditReply(reply)}
                                  className="p-1 rounded-lg hover:bg-[#F3F4F6] text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
                                  title="Edit"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteReply(reply.id)}
                                  className="p-1 rounded-lg hover:bg-[#FEE2E2] text-[#9CA3AF] hover:text-[#DC2626] transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                          {isEditingThis ? (
                            <div className="mt-1 space-y-2">
                              <input
                                type="text"
                                value={editReplyText}
                                onChange={(e) => setEditReplyText(e.target.value)}
                                className="w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-2.5 py-1.5 text-[13px] text-[#1F2937] outline-none focus:ring-2 focus:ring-[#6E5BFF]/20 focus:border-[#6E5BFF]/30"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleSaveEditReply();
                                  }
                                  if (e.key === "Escape") {
                                    handleCancelEditReply();
                                  }
                                }}
                              />
                              <div className="flex gap-2 justify-end">
                                <button
                                  onClick={handleCancelEditReply}
                                  className="px-2.5 py-1 text-[12px] font-medium text-[#6B7280] hover:bg-[#F3F4F6] rounded-lg transition-colors"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={handleSaveEditReply}
                                  className="px-2.5 py-1 text-[12px] font-medium text-white bg-[#6E5BFF] hover:bg-[#5B4AD9] rounded-lg transition-colors"
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="mt-1 text-[13px] leading-[1.5] text-[#374151]">
                              {reply.text}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Reply input - only in expanded state */}
              {isExpanded && (() => {
                const effectiveReplyName = currentAuthorName?.trim() || pendingReplyName.trim();
                const isReplyNameValid = effectiveReplyName.length > 0;
                const isAnonymousReply = !currentAuthorName?.trim() && !pendingReplyName.trim();

                return (
                  <div className="border-t border-[#F3F4F6] px-4 py-3">
                    {/* Inline name input - shown when no saved name exists */}
                    {!currentAuthorName?.trim() && (
                      <div className="mb-2">
                        <input
                          ref={replyNameInputRef}
                          type="text"
                          value={pendingReplyName}
                          onChange={(e) => setPendingReplyName(e.target.value)}
                          className="w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 text-sm text-[#1F2937] outline-none transition-all placeholder:text-[#9CA3AF] focus:ring-2 focus:ring-[#6E5BFF]/25"
                          placeholder="Your name"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && pendingReplyName.trim()) {
                              e.preventDefault();
                              replyInputRef.current?.focus();
                            }
                          }}
                        />
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <div
                        className="flex-shrink-0 flex items-center justify-center rounded-full"
                        style={{
                          width: "26px",
                          height: "26px",
                          backgroundColor: isAnonymousReply ? "#D4D4D4" : getAvatarColor(effectiveReplyName),
                        }}
                      >
                        {isAnonymousReply ? (
                          <MessageCircle className="h-3 w-3" style={{ color: "#666" }} />
                        ) : (
                          <span className="text-[11px] font-semibold text-white">
                            {getInitials(effectiveReplyName)}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 flex items-center gap-2 rounded-xl bg-[#F9FAFB] px-3 py-2">
                        <input
                          ref={replyInputRef}
                          type="text"
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Reply…"
                          className="flex-1 bg-transparent text-[13px] text-[#1F2937] outline-none placeholder:text-[#9CA3AF]"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && replyText.trim() && isReplyNameValid) {
                              e.preventDefault();
                              handleAddReply();
                            }
                          }}
                        />
                        {replyText.trim() && isReplyNameValid && (
                          <button
                            onClick={handleAddReply}
                            className="p-1 rounded-lg hover:bg-[#E5E7EB] text-[#6E5BFF] transition-colors"
                          >
                            <Send className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Posting as footer with name edit */}
                    {effectiveReplyName && (
                      <div className="mt-2 flex items-center gap-1">
                        <span className="text-[11px] text-[#9CA3AF]">
                          Posting as {effectiveReplyName}
                        </span>
                        <Popover open={isReplyNameEditOpen} onOpenChange={setIsReplyNameEditOpen}>
                          <PopoverTrigger
                            onClick={handleOpenReplyNameEdit}
                            className="p-0.5 text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
                          >
                            <Pencil className="h-3 w-3" />
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-60 p-3"
                            align="start"
                            side="top"
                            sideOffset={8}
                          >
                            <input
                              ref={replyNameEditInputRef}
                              type="text"
                              value={replyNameEditInput}
                              onChange={(e) => setReplyNameEditInput(e.target.value)}
                              className="w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 text-sm text-[#1F2937] outline-none transition-all placeholder:text-[#9CA3AF] focus:ring-2 focus:ring-[#6E5BFF]/25"
                              placeholder="Your name"
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && replyNameEditInput.trim()) {
                                  e.preventDefault();
                                  handleSaveReplyNameEdit();
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  handleCancelReplyNameEdit();
                                }
                              }}
                            />
                            <div className="mt-2 flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={handleCancelReplyNameEdit}
                                className="rounded-full bg-[#F3F4F6] px-3 py-1.5 text-xs font-medium text-[#1F2937] transition-all hover:bg-[#E5E7EB]"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={handleSaveReplyNameEdit}
                                disabled={!replyNameEditInput.trim()}
                                className="rounded-full bg-[#6E5BFF] px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-[#8170FF] disabled:opacity-50"
                              >
                                Save
                              </button>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  // Get nav context
  const nav = useNav();
  const {
    viewMode,
    setViewMode,
    landingUrlInput,
    setLandingUrlInput,
    urlInput,
    setUrlInput,
    isUrlFocused,
    setIsUrlFocused,
    setImageFileName,
    authorName,
    setAuthorName,
    landingUrlInputRef,
    urlInputRef,
    nameInputRef,
    setOnLandingUrlKeyDown,
    setOnUrlKeyDown,
    setOnUrlBlur,
    setOnGoToLanding,
  } = nav;

  const [isHydrated, setIsHydrated] = useState(false);

  // URL mode state
  const [currentUrl, setCurrentUrl] = useState(DEFAULT_URL);
  const [iframeError, setIframeError] = useState(false);

  // Image mode state
  const [currentImageId, setCurrentImageId] = useState<string | null>(null);
  const [imageDoc, setImageDoc] = useState<ImageDoc | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Shared comment state
  const [comments, setComments] = useState<Comment[]>([]);
  // Default to comment mode - users can place comments immediately
  const [mode, setMode] = useState<Mode>("comment");
  const [newCommentPos, setNewCommentPos] = useState<{ x: number; y: number } | null>(null);
  const [newCommentText, setNewCommentText] = useState("");
  const [pendingNameInput, setPendingNameInput] = useState(""); // Local name input - only saved on submit
  const [isNameEditOpen, setIsNameEditOpen] = useState(false); // Name edit popover state
  const [nameEditInput, setNameEditInput] = useState(""); // Temp input for name edit
  const [selectedPinId, setSelectedPinIdRaw] = useState<string | null>(null);
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [commentsVisible, setCommentsVisible] = useState(true);
  const [newCommentPopupPosition, setNewCommentPopupPosition] = useState<{
    horizontal: "left" | "right";
    vertical: "top" | "center" | "bottom";
  }>({ horizontal: "right", vertical: "center" });

  // Wrapper to log selectedPinId changes
  const setSelectedPinId = useCallback((id: string | null) => {
    console.log('[PARENT] setSelectedPinId called with:', id);
    if (id === null) {
      console.trace('[PARENT] STACK TRACE — who is calling setSelectedPinId(null)?');
    }
    setSelectedPinIdRaw(id);
  }, []);


  // Sidebar filter state - true = show resolved, false = show active
  const [showResolved, setShowResolved] = useState(false);

  // Sidebar is disabled for now - comment mode doesn't open sidebar
  // Set to `mode === "comment"` to re-enable sidebar with comment mode
  const isSidebarOpen = false;

  // Debug render log
  console.log('[RENDER] selectedPinId:', selectedPinId, 'isSidebarOpen:', isSidebarOpen, 'mode:', mode);
  // Name is valid if either saved (authorName) or pending input is filled
  const effectiveName = authorName?.trim() || pendingNameInput.trim();
  const isNameValid = effectiveName.length > 0;

  // Reset filter to default (active) when sidebar opens
  const prevSidebarOpen = useRef(false);
  useEffect(() => {
    if (isSidebarOpen && !prevSidebarOpen.current) {
      // Sidebar just opened - reset to active filter
      setShowResolved(false);
    }
    prevSidebarOpen.current = isSidebarOpen;
  }, [isSidebarOpen]);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const newCommentInputRef = useRef<HTMLInputElement>(null);
  const inlineNameInputRef = useRef<HTMLInputElement>(null);
  const nameEditInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isUrlCommittedRef = useRef(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const sidebarClickedRef = useRef(false);

  // Determine current target for comments
  const currentTargetType: "url" | "image" = viewMode === "image" ? "image" : "url";
  const currentTargetId = viewMode === "image" ? currentImageId : getHostname(currentUrl);

  const isLanding = viewMode === "landing";

  // Sync imageDoc.fileName to context
  useEffect(() => {
    setImageFileName(imageDoc?.fileName);
  }, [imageDoc?.fileName, setImageFileName]);

  // Disable browser's automatic scroll restoration
  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  // Track container width for pin positioning
  useEffect(() => {
    const container = viewMode === "image" ? imageContainerRef.current : containerRef.current;
    if (!container) return;

    const updateWidth = () => {
      setContainerWidth(container.offsetWidth);
    };

    updateWidth();

    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [viewMode, imageDoc]);

  // Load initial state on mount
  useEffect(() => {
    const urlParam = getUrlFromQueryParam();
    const imageParam = getImageFromQueryParam();

    if (imageParam) {
      // Image mode
      setViewMode("image");
      setCurrentImageId(imageParam);
    } else if (urlParam) {
      // URL mode with query param
      const normalizedUrl = normalizeUrl(urlParam);
      setViewMode("url");
      setCurrentUrl(normalizedUrl);
      setUrlInput(getDisplayUrl(normalizedUrl));
      updateBrowserUrl({ url: getDisplayUrl(normalizedUrl) });
    } else {
      // Landing page
      setViewMode("landing");
    }

    setIsHydrated(true);
  }, [setAuthorName, setUrlInput, setViewMode]);

  // Load image document when in image mode
  useEffect(() => {
    if (viewMode !== "image" || !currentImageId || !isHydrated) return;

    setIsLoadingImage(true);
    setImageError(null);

    const loadImage = async () => {
      try {
        const docRef = doc(db, "images", currentImageId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setImageDoc({
            id: docSnap.id,
            storageUrl: data.storageUrl,
            fileName: data.fileName,
            uploadedBy: data.uploadedBy,
            uploadedAt: data.uploadedAt instanceof Timestamp
              ? data.uploadedAt.toDate().toISOString()
              : data.uploadedAt,
            width: data.width,
            height: data.height,
          });
        } else {
          setImageError("Image not found");
        }
      } catch (error) {
        console.error("Error loading image:", error);
        setImageError("Failed to load image");
      } finally {
        setIsLoadingImage(false);
      }
    };

    loadImage();
  }, [viewMode, currentImageId, isHydrated]);

  // Subscribe to Firestore comments
  useEffect(() => {
    if (!isHydrated || viewMode === "landing" || !currentTargetId) return;

    setIsLoadingComments(true);

    // Build query based on target type
    // For backward compatibility: old comments have url field but no targetType
    let commentsQuery;
    if (currentTargetType === "url") {
      // Query by url field (backward compatible)
      commentsQuery = query(
        collection(db, "comments"),
        where("url", "==", currentTargetId)
      );
    } else {
      // Query by targetType and targetId for images
      commentsQuery = query(
        collection(db, "comments"),
        where("targetType", "==", "image"),
        where("targetId", "==", currentTargetId)
      );
    }

    const unsubscribe = onSnapshot(
      commentsQuery,
      (snapshot) => {
        const newComments: Comment[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            targetType: data.targetType || "url",
            targetId: data.targetId || data.url,
            x: data.x,
            y: data.y,
            text: data.text,
            author: data.author,
            createdAt: data.createdAt instanceof Timestamp
              ? data.createdAt.toDate().toISOString()
              : data.createdAt || new Date().toISOString(),
            resolved: data.resolved || false,
            resolvedBy: data.resolvedBy,
            resolvedAt: data.resolvedAt instanceof Timestamp
              ? data.resolvedAt.toDate().toISOString()
              : data.resolvedAt,
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

    return () => unsubscribe();
  }, [isHydrated, viewMode, currentTargetType, currentTargetId]);

  // Scroll to top when view changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentUrl, currentImageId]);

  // Save current URL to localStorage
  useEffect(() => {
    if (isHydrated && viewMode === "url") {
      localStorage.setItem(URL_KEY, currentUrl);
    }
  }, [currentUrl, isHydrated, viewMode]);

  // Focus new comment input (or name input if no name) when popup appears
  useEffect(() => {
    if (newCommentPos) {
      // Use setTimeout to allow React to render the inputs first
      setTimeout(() => {
        if (inlineNameInputRef.current) {
          inlineNameInputRef.current.focus();
        } else if (newCommentInputRef.current) {
          newCommentInputRef.current.focus();
        }
      }, 0);
    }
  }, [newCommentPos]);

  // Calculate optimal position for new comment popup based on viewport
  useEffect(() => {
    if (!newCommentPos) return;

    const container = viewMode === "image" ? imageContainerRef.current : containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const popupWidth = 280; // width of popup (w-70 = ~280px with max-width 320px)
    const popupHeight = 100; // estimated height
    const offset = 12;

    // Calculate pixel position of the pin
    const pinX = containerRect.left + (newCommentPos.x / 100) * containerRect.width;
    const pinY = containerRect.top + (newCommentPos.y / 100) * containerRect.height;

    // Check horizontal space
    const spaceOnRight = viewportWidth - pinX - offset;
    const spaceOnLeft = pinX - offset;
    const horizontal: "left" | "right" = spaceOnRight >= popupWidth ? "right" : "left";

    // Check vertical position
    const halfPopupHeight = popupHeight / 2;
    let vertical: "top" | "center" | "bottom" = "center";
    if (pinY - halfPopupHeight < 0) {
      vertical = "top";
    } else if (pinY + halfPopupHeight > viewportHeight) {
      vertical = "bottom";
    }

    setNewCommentPopupPosition({ horizontal, vertical });
  }, [newCommentPos, viewMode]);

  // Handle Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;

      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

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

  // Handle "C" key to enter comment mode (plain C only, no modifiers)
  useEffect(() => {
    if (viewMode === "landing") return;

    const handleCommentShortcut = (e: KeyboardEvent) => {
      // Ignore if any modifier key is held
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;

      // Ignore if typing in an input field
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === "c" || e.key === "C") {
        // Only enter comment mode, don't toggle (use Escape to exit)
        if (mode !== "comment") {
          setMode("comment");
        }
      }

      if (e.key === "h" || e.key === "H") {
        // Toggle comment visibility
        setCommentsVisible((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleCommentShortcut);
    return () => window.removeEventListener("keydown", handleCommentShortcut);
  }, [mode, viewMode]);

  // Navigate to URL mode
  const navigateToUrl = useCallback((newUrl: string) => {
    const normalizedUrl = normalizeUrl(newUrl);

    setViewMode("url");
    setCurrentUrl(normalizedUrl);
    setUrlInput(getDisplayUrl(normalizedUrl));
    setIframeError(false);
    setNewCommentPos(null);
    setSelectedPinId(null);
    setCurrentImageId(null);
    setImageDoc(null);

    updateBrowserUrl({ url: getDisplayUrl(normalizedUrl), image: null });
  }, [setViewMode, setUrlInput]);

  // Handle URL input key events
  const handleUrlKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
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
  }, [navigateToUrl, urlInput, currentUrl, setUrlInput, urlInputRef]);

  // Handle URL input blur
  const handleUrlBlur = useCallback(() => {
    setIsUrlFocused(false);
    if (isUrlCommittedRef.current) {
      isUrlCommittedRef.current = false;
      return;
    }
    setUrlInput(getDisplayUrl(currentUrl));
  }, [currentUrl, setUrlInput, setIsUrlFocused]);

  // Handle file upload
  const handleFileUpload = async (file: File) => {
    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError("Invalid file type. Please upload PNG, JPEG, WebP, or GIF.");
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setUploadError("File too large. Maximum size is 10MB.");
      return;
    }

    setUploadError(null);
    setUploadProgress(0);

    try {
      // Get image dimensions
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = document.createElement("img");
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });

      // Generate unique ID for the image
      const imageId = generateId();
      const fileExtension = file.name.split(".").pop() || "png";
      const storagePath = `images/${imageId}.${fileExtension}`;

      // Upload to Firebase Storage
      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => {
          console.error("Upload error:", error);
          setUploadError("Upload failed. Please try again.");
          setUploadProgress(null);
        },
        async () => {
          // Get download URL
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);

          // Create Firestore document
          await addDoc(collection(db, "images"), {
            storageUrl: downloadUrl,
            fileName: file.name,
            uploadedBy: authorName.trim() || "Anonymous",
            uploadedAt: serverTimestamp(),
            width: dimensions.width,
            height: dimensions.height,
          }).then((docRef) => {
            // Navigate to image view
            setUploadProgress(null);
            setViewMode("image");
            setCurrentImageId(docRef.id);
            setImageDoc({
              id: docRef.id,
              storageUrl: downloadUrl,
              fileName: file.name,
              uploadedBy: authorName.trim() || "Anonymous",
              uploadedAt: new Date().toISOString(),
              width: dimensions.width,
              height: dimensions.height,
            });
            updateBrowserUrl({ url: null, image: docRef.id });
          });
        }
      );
    } catch (error) {
      console.error("Error processing file:", error);
      setUploadError("Failed to process image. Please try again.");
      setUploadProgress(null);
    }
  };

  // Handle drag events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  // Handle overlay click for placing comments
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (selectedPinId !== null) {
      setSelectedPinId(null);
    }

    // Only allow comment placement if comments are visible and in comment mode
    if (mode === "comment" && commentsVisible) {
      const container = viewMode === "image" ? imageContainerRef.current : containerRef.current;
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
    // Require both name and comment text
    const nameToUse = authorName?.trim() || pendingNameInput.trim();
    if (!newCommentPos || !newCommentText.trim() || !currentTargetId || !nameToUse) return;

    try {
      // If using pending name, save it to localStorage now
      if (!authorName?.trim() && pendingNameInput.trim()) {
        setAuthorName(pendingNameInput.trim());
      }

      const commentData: Record<string, unknown> = {
        targetType: currentTargetType,
        targetId: currentTargetId,
        x: newCommentPos.x,
        y: newCommentPos.y,
        text: newCommentText.trim(),
        author: nameToUse,
        createdAt: serverTimestamp(),
        resolved: false,
        containerWidth: containerWidth,
      };

      // For backward compatibility, also set url field for URL mode
      if (currentTargetType === "url") {
        commentData.url = currentTargetId;
      }

      await addDoc(collection(db, "comments"), commentData);
      setNewCommentPos(null);
      setNewCommentText("");
      setPendingNameInput(""); // Clear pending name input
      // Stay in comment mode so user can place more comments
    } catch (error) {
      console.error("Error adding comment:", error);
    }
  };

  // Cancel new comment
  const handleCancelNewComment = () => {
    setNewCommentPos(null);
    setNewCommentText("");
    setPendingNameInput(""); // Discard pending name on cancel
  };

  // Name edit popover handlers
  const handleOpenNameEdit = () => {
    setNameEditInput(effectiveName);
    setIsNameEditOpen(true);
    // Focus and select after popover renders
    setTimeout(() => {
      if (nameEditInputRef.current) {
        nameEditInputRef.current.focus();
        nameEditInputRef.current.select();
      }
    }, 0);
  };

  const handleSaveNameEdit = () => {
    if (!nameEditInput.trim()) return;
    setAuthorName(nameEditInput.trim());
    setPendingNameInput(""); // Clear pending since we now have a saved name
    setIsNameEditOpen(false);
  };

  const handleCancelNameEdit = () => {
    setIsNameEditOpen(false);
    setNameEditInput("");
  };

  // Edit comment
  const handleEditComment = async (id: string, text: string) => {
    try {
      await updateDoc(doc(db, "comments", id), { text });
    } catch (error) {
      console.error("Error editing comment:", error);
    }
  };

  // Move comment (drag to new position)
  const handleMoveComment = async (id: string, x: number, y: number) => {
    try {
      await updateDoc(doc(db, "comments", id), { x, y, containerWidth: containerWidth });
    } catch (error) {
      console.error("Error moving comment:", error);
    }
  };

  // Delete comment
  const handleDeleteComment = async (id: string) => {
    try {
      await deleteDoc(doc(db, "comments", id));
    } catch (error) {
      console.error("Error deleting comment:", error);
    }
  };

  // Resolve comment
  const handleResolveComment = async (id: string) => {
    try {
      await updateDoc(doc(db, "comments", id), {
        resolved: true,
        resolvedBy: authorName.trim() || "Anonymous",
        resolvedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error resolving comment:", error);
    }
  };

  // Reopen comment
  const handleReopenComment = async (id: string) => {
    try {
      await updateDoc(doc(db, "comments", id), {
        resolved: false,
        resolvedBy: null,
        resolvedAt: null,
      });
    } catch (error) {
      console.error("Error reopening comment:", error);
    }
  };

  // Go back to landing
  const goToLanding = useCallback(() => {
    setViewMode("landing");
    setMode("browse");
    setSelectedPinId(null);
    setNewCommentPos(null);
    setComments([]);
    setLandingUrlInput("");
    updateBrowserUrl({ url: null, image: null });
    window.history.replaceState({}, "", window.location.pathname);
  }, [setViewMode, setLandingUrlInput]);

  // Autofocus URL input on landing page
  useEffect(() => {
    if (isLanding && isHydrated && landingUrlInputRef.current) {
      landingUrlInputRef.current.focus();
    }
  }, [isLanding, isHydrated, landingUrlInputRef]);

  // Handle landing URL input key events
  const handleLandingUrlKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (landingUrlInput.trim()) {
        navigateToUrl(landingUrlInput);
      }
    }
  }, [landingUrlInput, navigateToUrl]);

  // Register event handlers with the nav context
  useEffect(() => {
    setOnLandingUrlKeyDown(handleLandingUrlKeyDown);
  }, [handleLandingUrlKeyDown, setOnLandingUrlKeyDown]);

  useEffect(() => {
    setOnUrlKeyDown(handleUrlKeyDown);
  }, [handleUrlKeyDown, setOnUrlKeyDown]);

  useEffect(() => {
    setOnUrlBlur(handleUrlBlur);
  }, [handleUrlBlur, setOnUrlBlur]);

  useEffect(() => {
    setOnGoToLanding(goToLanding);
  }, [goToLanding, setOnGoToLanding]);

  // Single return - nav is rendered in layout, we just render the content
  return (
    <div className="flex flex-1 flex-col bg-[#FAFAFA]">
      {/* Landing page content */}
      {isLanding && (
        <>
          {/* Body - centered muted text */}
          <div className="flex flex-1 items-center justify-center">
            <p className="text-[14px] font-normal text-[#9CA3AF]">
              Enter your demo site URL to start commenting
            </p>
          </div>

          {/* Muted FAB */}
          {SHOW_FLOATING_COMMENTS_BUTTON && (
            <div
              className="fixed bottom-6 right-6 z-50 flex items-center justify-center rounded-full opacity-50 cursor-not-allowed"
              style={{ width: "52px", height: "52px", backgroundColor: "#6E5BFF" }}
            >
              <MessageCircle className="h-[22px] w-[22px] text-white" strokeWidth={2.5} />
            </div>
          )}
        </>
      )}

      {/* Viewing page content */}
      {!isLanding && (
        <>
          {/* Main Content Area with Sidebar */}
          <div className="flex flex-1">
            {/* Content Container */}
            <div
              className={cn(
                "relative transition-all duration-300",
                isSidebarOpen ? "mr-80" : "mr-0"
              )}
              style={{ width: isSidebarOpen ? "calc(100% - 320px)" : "100%" }}
            >
              {/* URL Mode: Iframe */}
              {viewMode === "url" && (
                <div ref={containerRef} className="relative">
                  {iframeError ? (
                      <div className="flex h-[500px] w-full flex-col items-center justify-center bg-[#FAFAFA] text-center">
                        <div className="rounded-xl border border-[#E5E7EB] bg-white p-8 shadow-sm">
                          <div className="mb-4 text-4xl">🚫</div>
                          <h2 className="mb-2 text-xl font-semibold text-[#1F2937]">
                            This site cannot be embedded
                          </h2>
                          <p className="mb-4 max-w-md text-[#6B7280]">
                            Try uploading a screenshot instead, or open{" "}
                            <a
                              href={currentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#6E5BFF] hover:text-[#8170FF] underline"
                            >
                              {getDisplayUrl(currentUrl)}
                            </a>{" "}
                            in a new tab.
                          </p>
                          <button
                            onClick={goToLanding}
                            className="rounded-full bg-[#F3F4F6] px-4 py-2 text-sm font-medium text-[#1F2937] transition-all hover:bg-[#E5E7EB]"
                          >
                            Upload Screenshot Instead
                          </button>
                        </div>
                      </div>
                    ) : (
                      <iframe
                        key={currentUrl}
                        src={currentUrl}
                        className="w-full border-0"
                        style={{ height: "3000px" }}
                        title="Target Website"
                        onError={() => setIframeError(true)}
                      />
                    )}

                  {/* Overlay */}
                  <div
                    className={cn(
                      "absolute inset-0",
                      mode === "comment" && commentsVisible
                        ? "cursor-crosshair pointer-events-auto"
                        : selectedPinId !== null
                          ? "pointer-events-auto"
                          : "pointer-events-none"
                    )}
                    onClick={handleOverlayClick}
                    onMouseMove={(e) => {
                      if (mode === "comment" && commentsVisible && !newCommentPos) {
                        setCursorPos({ x: e.clientX, y: e.clientY });
                      }
                    }}
                    onMouseLeave={() => setCursorPos(null)}
                  />

                  {/* Comment Pins - filtered by resolved state and visibility */}
                  {/* When showResolved is true, show all comments; when false, show only unresolved */}
                  {commentsVisible && comments
                    .filter((comment) => showResolved || !comment.resolved)
                    .map((comment) => (
                      <CommentPin
                        key={comment.id}
                        comment={comment}
                        isSelected={selectedPinId === comment.id}
                        isHighlighted={hoveredPinId === comment.id}
                                                currentAuthorName={authorName}
                        onSetAuthorName={setAuthorName}
                        onSelect={setSelectedPinId}
                        onHover={setHoveredPinId}
                        onEdit={handleEditComment}
                        onDelete={handleDeleteComment}
                        onResolve={handleResolveComment}
                        onReopen={handleReopenComment}
                        onMove={handleMoveComment}
                        containerRef={containerRef}
                      />
                    ))}

                  {/* New Comment Popup */}
                  {newCommentPos && (
                    <div
                      className={cn(
                        "pointer-events-auto absolute z-50",
                        newCommentPopupPosition.vertical === "top" && "origin-top-left",
                        newCommentPopupPosition.vertical === "bottom" && "origin-bottom-left"
                      )}
                      style={{
                        left: newCommentPopupPosition.horizontal === "right" ? `${newCommentPos.x}%` : undefined,
                        right: newCommentPopupPosition.horizontal === "left" ? `${100 - newCommentPos.x}%` : undefined,
                        top: newCommentPopupPosition.vertical !== "bottom" ? `${newCommentPos.y}%` : undefined,
                        bottom: newCommentPopupPosition.vertical === "bottom" ? `${100 - newCommentPos.y}%` : undefined,
                        transform: newCommentPopupPosition.horizontal === "right"
                          ? (newCommentPopupPosition.vertical === "center" ? "translate(12px, -50%)" : "translateX(12px)")
                          : (newCommentPopupPosition.vertical === "center" ? "translate(-12px, -50%)" : "translateX(-12px)"),
                      }}
                    >
                      <div className="w-70 max-w-[320px] rounded-xl border border-[#E5E7EB] bg-white p-3 shadow-lg" style={{ width: "280px" }}>
                        {/* Inline name input - shown when no saved name exists */}
                        {!authorName?.trim() && (
                          <div className="mb-2">
                            <input
                              ref={inlineNameInputRef}
                              type="text"
                              value={pendingNameInput}
                              onChange={(e) => setPendingNameInput(e.target.value)}
                              className="w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 text-sm text-[#1F2937] outline-none transition-all placeholder:text-[#9CA3AF] focus:ring-2 focus:ring-[#6E5BFF]/25"
                              placeholder="Your name"
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && pendingNameInput.trim()) {
                                  e.preventDefault();
                                  newCommentInputRef.current?.focus();
                                }
                                if (e.key === "Escape") handleCancelNewComment();
                              }}
                            />
                          </div>
                        )}
                        <input
                          ref={newCommentInputRef}
                          value={newCommentText}
                          onChange={(e) => setNewCommentText(e.target.value)}
                          className="w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 text-sm text-[#1F2937] outline-none transition-all placeholder:text-[#9CA3AF] focus:ring-2 focus:ring-[#6E5BFF]/25"
                          placeholder="Add a comment..."
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && isNameValid && newCommentText.trim()) handlePostComment();
                            if (e.key === "Escape") handleCancelNewComment();
                          }}
                        />
                        <div className="mt-2 flex items-center justify-between">
                          {effectiveName ? (
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] text-[#9CA3AF]">
                                Posting as {effectiveName}
                              </span>
                              <Popover open={isNameEditOpen} onOpenChange={setIsNameEditOpen}>
                                <PopoverTrigger
                                  onClick={handleOpenNameEdit}
                                  className="p-0.5 text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
                                >
                                  <Pencil className="h-3 w-3" />
                                </PopoverTrigger>
                                <PopoverContent
                                  className="w-60 p-3"
                                  align="start"
                                  side="top"
                                  sideOffset={8}
                                >
                                  <input
                                    ref={nameEditInputRef}
                                    type="text"
                                    value={nameEditInput}
                                    onChange={(e) => setNameEditInput(e.target.value)}
                                    className="w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 text-sm text-[#1F2937] outline-none transition-all placeholder:text-[#9CA3AF] focus:ring-2 focus:ring-[#6E5BFF]/25"
                                    placeholder="Your name"
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" && nameEditInput.trim()) {
                                        e.preventDefault();
                                        handleSaveNameEdit();
                                      }
                                      if (e.key === "Escape") {
                                        e.preventDefault();
                                        handleCancelNameEdit();
                                      }
                                    }}
                                  />
                                  <div className="mt-2 flex justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={handleCancelNameEdit}
                                      className="rounded-full bg-[#F3F4F6] px-3 py-1.5 text-xs font-medium text-[#1F2937] transition-all hover:bg-[#E5E7EB]"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleSaveNameEdit}
                                      disabled={!nameEditInput.trim()}
                                      className="rounded-full bg-[#6E5BFF] px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-[#8170FF] disabled:opacity-50"
                                    >
                                      Save
                                    </button>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </div>
                          ) : (
                            <span className="text-[11px] text-[#9CA3AF]" />
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={handleCancelNewComment}
                              className="rounded-full bg-[#F3F4F6] px-3 py-1.5 text-xs font-medium text-[#1F2937] transition-all hover:bg-[#E5E7EB]"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handlePostComment}
                              disabled={!newCommentText.trim() || !isNameValid}
                              className="rounded-full bg-[#6E5BFF] px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-[#8170FF] disabled:opacity-50"
                            >
                              Post
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Image Mode */}
              {viewMode === "image" && (
                <div className="flex items-center justify-center bg-[#FAFAFA] p-8" style={{ minHeight: `calc(100vh - ${NAV_HEIGHT}px)` }}>
                  {isLoadingImage ? (
                    <div className="text-[#9CA3AF]">Loading image...</div>
                  ) : imageError ? (
                    <div className="text-center">
                      <div className="mb-4 text-4xl">🖼️</div>
                      <h2 className="mb-2 text-xl font-semibold text-[#1F2937]">
                        {imageError}
                      </h2>
                      <p className="mb-4 text-[#6B7280]">
                        This image may have been deleted or the link is invalid.
                      </p>
                      <button
                        onClick={goToLanding}
                        className="rounded-full bg-[#6E5BFF] px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#8170FF]"
                      >
                        Go Back
                      </button>
                    </div>
                  ) : imageDoc ? (
                    <div
                      ref={imageContainerRef}
                      className="relative overflow-hidden rounded-lg border border-[#E5E7EB] shadow-lg"
                      style={{
                        maxWidth: "100%",
                        maxHeight: "calc(100vh - 120px)",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageDoc.storageUrl}
                        alt={imageDoc.fileName}
                        className="block max-w-full max-h-[calc(100vh-120px)] object-contain"
                        style={{
                          width: "auto",
                          height: "auto",
                        }}
                      />

                      {/* Overlay */}
                      <div
                        className={cn(
                          "absolute inset-0",
                          mode === "comment" && commentsVisible
                            ? "cursor-crosshair pointer-events-auto"
                            : selectedPinId !== null
                              ? "pointer-events-auto"
                              : "pointer-events-none"
                        )}
                        onClick={handleOverlayClick}
                        onMouseMove={(e) => {
                          if (mode === "comment" && commentsVisible && !newCommentPos) {
                            setCursorPos({ x: e.clientX, y: e.clientY });
                          }
                        }}
                        onMouseLeave={() => setCursorPos(null)}
                      />

                      {/* Comment Pins - filtered by resolved state and visibility */}
                      {/* When showResolved is true, show all comments; when false, show only unresolved */}
                      {commentsVisible && comments
                        .filter((comment) => showResolved || !comment.resolved)
                        .map((comment) => (
                          <CommentPin
                            key={comment.id}
                            comment={comment}
                            isSelected={selectedPinId === comment.id}
                            isHighlighted={hoveredPinId === comment.id}
                                                        currentAuthorName={authorName}
                            onSetAuthorName={setAuthorName}
                            onSelect={setSelectedPinId}
                            onHover={setHoveredPinId}
                            onEdit={handleEditComment}
                            onDelete={handleDeleteComment}
                            onResolve={handleResolveComment}
                            onReopen={handleReopenComment}
                            onMove={handleMoveComment}
                            containerRef={imageContainerRef}
                          />
                        ))}

                      {/* New Comment Popup */}
                      {newCommentPos && (
                        <div
                          className={cn(
                            "pointer-events-auto absolute z-50",
                            newCommentPopupPosition.vertical === "top" && "origin-top-left",
                            newCommentPopupPosition.vertical === "bottom" && "origin-bottom-left"
                          )}
                          style={{
                            left: newCommentPopupPosition.horizontal === "right" ? `${newCommentPos.x}%` : undefined,
                            right: newCommentPopupPosition.horizontal === "left" ? `${100 - newCommentPos.x}%` : undefined,
                            top: newCommentPopupPosition.vertical !== "bottom" ? `${newCommentPos.y}%` : undefined,
                            bottom: newCommentPopupPosition.vertical === "bottom" ? `${100 - newCommentPos.y}%` : undefined,
                            transform: newCommentPopupPosition.horizontal === "right"
                              ? (newCommentPopupPosition.vertical === "center" ? "translate(12px, -50%)" : "translateX(12px)")
                              : (newCommentPopupPosition.vertical === "center" ? "translate(-12px, -50%)" : "translateX(-12px)"),
                          }}
                        >
                          <div className="w-70 max-w-[320px] rounded-xl border border-[#E5E7EB] bg-white p-3 shadow-lg" style={{ width: "280px" }}>
                            {/* Inline name input - shown when no saved name exists */}
                            {!authorName?.trim() && (
                              <div className="mb-2">
                                <input
                                  ref={inlineNameInputRef}
                                  type="text"
                                  value={pendingNameInput}
                                  onChange={(e) => setPendingNameInput(e.target.value)}
                                  className="w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 text-sm text-[#1F2937] outline-none transition-all placeholder:text-[#9CA3AF] focus:ring-2 focus:ring-[#6E5BFF]/25"
                                  placeholder="Your name"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && pendingNameInput.trim()) {
                                      e.preventDefault();
                                      newCommentInputRef.current?.focus();
                                    }
                                    if (e.key === "Escape") handleCancelNewComment();
                                  }}
                                />
                              </div>
                            )}
                            <input
                              ref={newCommentInputRef}
                              value={newCommentText}
                              onChange={(e) => setNewCommentText(e.target.value)}
                              className="w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 text-sm text-[#1F2937] outline-none transition-all placeholder:text-[#9CA3AF] focus:ring-2 focus:ring-[#6E5BFF]/25"
                              placeholder="Add a comment..."
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && isNameValid && newCommentText.trim()) handlePostComment();
                                if (e.key === "Escape") handleCancelNewComment();
                              }}
                            />
                            <div className="mt-2 flex items-center justify-between">
                              {effectiveName ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-[11px] text-[#9CA3AF]">
                                    Posting as {effectiveName}
                                  </span>
                                  <Popover open={isNameEditOpen} onOpenChange={setIsNameEditOpen}>
                                    <PopoverTrigger
                                      onClick={handleOpenNameEdit}
                                      className="p-0.5 text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </PopoverTrigger>
                                    <PopoverContent
                                      className="w-60 p-3"
                                      align="start"
                                      side="top"
                                      sideOffset={8}
                                    >
                                      <input
                                        ref={nameEditInputRef}
                                        type="text"
                                        value={nameEditInput}
                                        onChange={(e) => setNameEditInput(e.target.value)}
                                        className="w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2 text-sm text-[#1F2937] outline-none transition-all placeholder:text-[#9CA3AF] focus:ring-2 focus:ring-[#6E5BFF]/25"
                                        placeholder="Your name"
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter" && nameEditInput.trim()) {
                                            e.preventDefault();
                                            handleSaveNameEdit();
                                          }
                                          if (e.key === "Escape") {
                                            e.preventDefault();
                                            handleCancelNameEdit();
                                          }
                                        }}
                                      />
                                      <div className="mt-2 flex justify-end gap-2">
                                        <button
                                          type="button"
                                          onClick={handleCancelNameEdit}
                                          className="rounded-full bg-[#F3F4F6] px-3 py-1.5 text-xs font-medium text-[#1F2937] transition-all hover:bg-[#E5E7EB]"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          type="button"
                                          onClick={handleSaveNameEdit}
                                          disabled={!nameEditInput.trim()}
                                          className="rounded-full bg-[#6E5BFF] px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-[#8170FF] disabled:opacity-50"
                                        >
                                          Save
                                        </button>
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                </div>
                              ) : (
                                <span className="text-[11px] text-[#9CA3AF]" />
                              )}
                              <div className="flex gap-2">
                                <button
                                  onClick={handleCancelNewComment}
                                  className="rounded-full bg-[#F3F4F6] px-3 py-1.5 text-xs font-medium text-[#1F2937] transition-all hover:bg-[#E5E7EB]"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={handlePostComment}
                                  disabled={!newCommentText.trim() || !isNameValid}
                                  className="rounded-full bg-[#6E5BFF] px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-[#8170FF] disabled:opacity-50"
                                >
                                  Post
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* Cursor-following avatar in comment mode */}
            {mode === "comment" && commentsVisible && !newCommentPos && cursorPos && (
              (() => {
                // Viewport collision detection for comment pin cursor
                const pinSize = 28;
                const offset = 6;
                const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1920;
                const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 1080;

                // Determine horizontal position
                const spaceOnRight = viewportWidth - cursorPos.x - offset;
                const positionLeft = spaceOnRight >= pinSize;
                const left = positionLeft
                  ? cursorPos.x + offset
                  : cursorPos.x - offset - pinSize;

                // Determine vertical position
                const spaceBelow = viewportHeight - cursorPos.y - offset;
                const positionBelow = spaceBelow >= pinSize;
                const top = positionBelow
                  ? cursorPos.y + offset
                  : cursorPos.y - offset - pinSize;

                // Anonymous state: gray circle with MessageCircle icon
                // Named state: colored circle with initial
                const isAnonymous = !authorName?.trim();

                return (
                  <div
                    className="pointer-events-none fixed z-[100]"
                    style={{
                      left: Math.max(8, Math.min(left, viewportWidth - pinSize - 8)),
                      top: Math.max(8, Math.min(top, viewportHeight - pinSize - 8)),
                    }}
                  >
                    <div
                      className="flex h-7 w-7 items-center justify-center rounded-full shadow-lg"
                      style={{ backgroundColor: isAnonymous ? "#D4D4D4" : getAvatarColor(authorName) }}
                    >
                      {isAnonymous ? (
                        <MessageCircle className="h-3.5 w-3.5" style={{ color: "#666" }} />
                      ) : (
                        <span className="text-[11px] font-semibold text-white">
                          {authorName.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()
            )}


            {/* Comments Sidebar */}
            <div
              ref={sidebarRef}
              data-sidebar
              className={cn(
                "fixed right-0 bottom-0 flex flex-col border-l border-[#E5E7EB] bg-white transition-all duration-300 z-40",
                isSidebarOpen ? "w-80" : "w-0"
              )}
              style={{ top: `${NAV_HEIGHT}px` }}
              onPointerDownCapture={() => {
                // Mark that sidebar was clicked - CommentPin's handlePopoverChange will check this
                // Using onPointerDownCapture to fire BEFORE Base UI Popover's pointerdown listener
                sidebarClickedRef.current = true;
                // Clear after a short delay to handle edge cases
                setTimeout(() => {
                  sidebarClickedRef.current = false;
                }, 100);
              }}
            >
              {isSidebarOpen && (() => {
                // Compute filtered comments based on showResolved toggle
                const activeComments = comments.filter((c) => !c.resolved);

                // Filter logic: show only active, or all (active + resolved)
                const filteredComments = showResolved ? comments : activeComments;

                // Header label and count
                const headerLabel = showResolved ? "ALL COMMENTS" : "COMMENTS";
                const headerCount = filteredComments.length;

                // Empty state logic
                const showEmptyState = filteredComments.length === 0;
                const emptyStateText = "No comments yet. Press C to add one.";

                return (
                  <>
                    {/* Header with close button */}
                    <div className="flex items-center justify-between px-4 pt-4 pb-2">
                      <h2 className="text-[11px] font-medium uppercase tracking-[1px] text-[#9CA3AF]">
                        {headerLabel}{headerCount > 0 && ` · ${headerCount}`}
                      </h2>
                      <button
                        onClick={() => {
                          setMode("browse");
                          setSelectedPinId(null);
                          setNewCommentPos(null);
                        }}
                        className="text-[#9CA3AF] transition-colors hover:text-[#1F2937]"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Single Resolved toggle button */}
                    <div className="flex gap-1.5 px-4 pb-3">
                      <button
                        onClick={() => setShowResolved(!showResolved)}
                        className={cn(
                          "rounded-full text-[12px] font-medium transition-all duration-150",
                          showResolved
                            ? "border border-transparent bg-[#6E5BFF] px-3 py-[5px] text-white"
                            : "border border-[#E5E7EB] bg-transparent px-3 py-[5px] text-[#6B7280] hover:border-[#D1D5DB]"
                        )}
                      >
                        Resolved
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 pb-4">
                      {isLoadingComments ? (
                        <div className="flex h-full items-center justify-center">
                          <p className="text-center text-[13px] text-[#9CA3AF]">
                            Loading comments...
                          </p>
                        </div>
                      ) : showEmptyState ? (
                        <div className="flex h-full flex-col items-center justify-center py-10">
                          <p className="text-center text-[13px] text-[#9CA3AF]">
                            {emptyStateText}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {[...filteredComments]
                            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                            .map((comment) => {
                              const isResolved = comment.resolved;
                              const isSelected = selectedPinId === comment.id;
                              const isHovered = hoveredPinId === comment.id;

                              // Resolved comment styling (muted, no strikethrough)
                              if (isResolved) {
                                return (
                                  <div
                                    key={comment.id}
                                    onClick={() => setSelectedPinId(comment.id)}
                                    onMouseEnter={() => setHoveredPinId(comment.id)}
                                    onMouseLeave={() => setHoveredPinId(null)}
                                    className={cn(
                                      "cursor-pointer rounded-xl px-3.5 py-2.5 transition-all duration-150 bg-[#F9FAFB]",
                                      isSelected ? "opacity-100" : isHovered ? "opacity-85" : "opacity-70"
                                    )}
                                  >
                                    <p className="text-[13px] font-medium leading-relaxed text-[#9CA3AF]">
                                      {comment.text}
                                    </p>
                                    <div className="mt-1 flex items-center gap-1 text-[11px] text-[#9CA3AF]">
                                      <span>{comment.author}</span>
                                      <span>·</span>
                                      <span>{formatRelativeTime(comment.createdAt)}</span>
                                    </div>
                                  </div>
                                );
                              }

                              // Active comment styling
                              return (
                                <div
                                  key={comment.id}
                                  onClick={() => setSelectedPinId(comment.id)}
                                  onMouseEnter={() => setHoveredPinId(comment.id)}
                                  onMouseLeave={() => setHoveredPinId(null)}
                                  className={cn(
                                    "cursor-pointer rounded-xl px-3.5 py-2.5 transition-all duration-150",
                                    isSelected
                                      ? "bg-[#6E5BFF]"
                                      : isHovered
                                        ? "bg-[#F3F4F6]"
                                        : "bg-[#F9FAFB] hover:bg-[#F3F4F6]"
                                  )}
                                >
                                  <p className={cn(
                                    "text-[13px] font-medium leading-relaxed",
                                    isSelected ? "text-white" : "text-[#1F2937]"
                                  )}>
                                    {comment.text}
                                  </p>
                                  <div className={cn(
                                    "mt-1 flex items-center gap-2 text-[11px]",
                                    isSelected ? "text-[#D6D0FF]" : "text-[#9CA3AF]"
                                  )}>
                                    <span>{comment.author}</span>
                                    <span>·</span>
                                    <span>{formatRelativeTime(comment.createdAt)}</span>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Old Floating Action Button (hidden) */}
          {SHOW_FLOATING_COMMENTS_BUTTON && (
            <button
              type="button"
              onClick={() => {
                if (isSidebarOpen) {
                  setMode("browse");
                  setSelectedPinId(null);
                  setNewCommentPos(null);
                } else {
                  setMode("comment");
                }
              }}
              className={cn(
                "fixed bottom-6 right-6 z-50 flex h-13 w-13 items-center justify-center rounded-full transition-all duration-150 ease-out",
                "bg-[#6E5BFF] text-white shadow-lg",
                "hover:scale-105 hover:bg-[#8170FF]"
              )}
              style={{ width: "52px", height: "52px" }}
            >
              {isSidebarOpen ? (
                <X className="h-[22px] w-[22px]" strokeWidth={2.5} />
              ) : (
                <MessageCircle className="h-[22px] w-[22px]" strokeWidth={2.5} />
              )}
              {/* Comment count badge - only show active comments count */}
              {!isSidebarOpen && comments.filter((c) => !c.resolved).length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#EF4444] px-1 text-[11px] font-medium text-white">
                  {comments.filter((c) => !c.resolved).length}
                </span>
              )}
            </button>
          )}

          {/* Floating Comment Controls - Vertical Pill */}
          <div
            className="fixed right-3 top-1/2 -translate-y-1/2 z-50 flex flex-col items-center"
            style={{
              backgroundColor: "#1F2937",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "16px",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.12)",
              padding: "3px",
            }}
          >
            {/* Top Button - Toggle Comments Visibility */}
            <div className="relative group/visibility">
              {/* Tooltip */}
              <div
                className={cn(
                  "absolute right-full top-1/2 -translate-y-1/2 mr-2",
                  "flex items-center gap-1.5 rounded-full bg-[#1F2937] px-2 py-1",
                  "opacity-0 translate-x-2 pointer-events-none",
                  "group-hover/visibility:opacity-100 group-hover/visibility:translate-x-0",
                  "transition-all duration-150 ease-out whitespace-nowrap"
                )}
                style={{
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
                }}
              >
                <span className="text-[11px] font-medium text-white">
                  {commentsVisible ? "Hide comments" : "Show comments"}
                </span>
                <kbd className="flex h-3.5 min-w-3.5 items-center justify-center rounded bg-white/20 px-0.5 text-[9px] font-medium text-white/90">
                  H
                </kbd>
              </div>
              <button
                type="button"
                onClick={() => setCommentsVisible((prev) => !prev)}
                className={cn(
                  "flex items-center justify-center rounded-full transition-all duration-150",
                  commentsVisible ? "text-white" : "text-white/40"
                )}
                style={{
                  width: "26px",
                  height: "26px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                {commentsVisible ? (
                  <Eye className="h-3.5 w-3.5" strokeWidth={2} />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" strokeWidth={2} />
                )}
              </button>
            </div>

            {/* Bottom Button - Toggle Resolved Comments */}
            <div className="relative group/resolved">
              {/* Tooltip */}
              <div
                className={cn(
                  "absolute right-full top-1/2 -translate-y-1/2 mr-2",
                  "flex items-center gap-1.5 rounded-full bg-[#1F2937] px-2 py-1",
                  "opacity-0 translate-x-2 pointer-events-none",
                  "group-hover/resolved:opacity-100 group-hover/resolved:translate-x-0",
                  "transition-all duration-150 ease-out whitespace-nowrap"
                )}
                style={{
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
                }}
              >
                <span className="text-[11px] font-medium text-white">
                  {showResolved ? "Hide resolved" : "Show resolved"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowResolved((prev) => !prev)}
                className={cn(
                  "relative flex items-center justify-center rounded-full transition-all duration-150",
                  showResolved ? "text-white" : "text-white/40"
                )}
                style={{
                  width: "26px",
                  height: "26px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
