"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { MessageCircle, X, Check } from "lucide-react";
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
const AUTHOR_KEY = "stellar-author-name";
const URL_KEY = "stellar-current-url";
const DEFAULT_URL = "https://stellarskills-git-main-minkyeongshins-projects.vercel.app";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

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
  onResolve,
  onReopen,
  sidebarClickedRef,
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
  onResolve: (id: string) => void;
  onReopen: (id: string) => void;
  sidebarClickedRef: React.RefObject<boolean | null>;
}) {
  // Calculate adjusted x position to keep pin anchored when container resizes
  const adjustedX = comment.containerWidth && currentContainerWidth > 0
    ? (comment.x * comment.containerWidth / currentContainerWidth)
    : comment.x;
  const [isLocalHover, setIsLocalHover] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);

  const showHoverTooltip = isLocalHover && !isSelected && !isSidebarOpen;
  const isResolved = comment.resolved;

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

  const handlePopoverChange = (open: boolean) => {
    if (open) {
      onSelect(comment.id);
    } else {
      // Don't deselect if the click was inside the sidebar
      // Check both the ref (for general sidebar clicks) and the DOM (as fallback)
      const sidebar = document.querySelector('[data-sidebar]');
      const activeEl = document.activeElement;
      const isClickInsideSidebar = sidebarClickedRef.current || (sidebar && activeEl && sidebar.contains(activeEl));

      if (isClickInsideSidebar) {
        sidebarClickedRef.current = false;
        return;
      }
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
            "flex h-7 w-7 items-center justify-center rounded-full transition-all duration-150",
            isSelected
              ? "scale-110 shadow-lg"
              : isHighlighted
                ? "scale-[1.3]"
                : "shadow-lg hover:scale-110"
          )}
          style={{
            backgroundColor: pinBgColor,
            boxShadow: isSelected
              ? `0 10px 15px -3px rgba(0,0,0,0.1), 0 0 0 2px ${pinRingColor}`
              : isHighlighted
                ? pinHighlightShadow
                : undefined,
          }}
        >
          <MessageCircle className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
        </PopoverTrigger>
        <PopoverContent
          side="right"
          className="w-64 rounded-xl border border-[#1F1F26] bg-[#1A1A22] p-3"
        >
          {isEditing ? (
            <div className="space-y-2">
              <input
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full rounded-full border-none bg-[#22222C] px-3 py-2 text-sm text-white outline-none transition-all placeholder:text-[#6B6B75] focus:ring-2 focus:ring-[#6E5BFF]/25"
                placeholder="Edit comment..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEdit();
                  if (e.key === "Escape") setIsEditing(false);
                }}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveEdit}
                  className="rounded-full bg-[#6E5BFF] px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-[#8170FF]"
                >
                  Save
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="rounded-full bg-[#22222C] px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-[#2A2A33]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-white">{comment.text}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-[#6B6B75]">
                  <span>{comment.author}</span>
                  <span>·</span>
                  <span>{formatRelativeTime(comment.createdAt)}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsEditing(true)}
                  className="rounded-full bg-[#22222C] px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-[#2A2A33]"
                >
                  Edit
                </button>
                {isResolved ? (
                  <button
                    onClick={() => {
                      onReopen(comment.id);
                      onSelect(null);
                    }}
                    className="rounded-full bg-[#22222C] px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-[#2A2A33]"
                  >
                    Reopen
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      onResolve(comment.id);
                      onSelect(null);
                    }}
                    className="rounded-full bg-[#1A2F26] px-3 py-1.5 text-xs font-medium text-[#5DCAA5] transition-all hover:bg-[#224036]"
                  >
                    Resolve
                  </button>
                )}
                <button
                  onClick={() => {
                    onDelete(comment.id);
                    onSelect(null);
                  }}
                  className="rounded-full bg-[#3A1F22] px-3 py-1.5 text-xs font-medium text-[#F09595] transition-all hover:bg-[#4A2A2D]"
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {showHoverTooltip && (
        <div
          className="pointer-events-none absolute left-1/2 bottom-full mb-3 z-50"
          style={{ transform: "translateX(-50%)" }}
        >
          <div className="relative min-w-[260px] max-w-[340px] rounded-xl border border-[#1F1F26] bg-[#1A1A22] p-4 shadow-2xl">
            <p className="text-sm font-medium leading-relaxed text-white whitespace-pre-wrap">
              {comment.text}
            </p>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-[#6B6B75]">
              <span>{comment.author}</span>
              <span>·</span>
              <span>{formatRelativeTime(comment.createdAt)}</span>
            </div>
            <div className="absolute left-1/2 -bottom-2 -translate-x-1/2">
              <div className="h-3 w-3 rotate-45 border-b border-r border-[#1F1F26] bg-[#1A1A22]" />
            </div>
          </div>
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
  const [mode, setMode] = useState<Mode>("browse");
  const [newCommentPos, setNewCommentPos] = useState<{ x: number; y: number } | null>(null);
  const [newCommentText, setNewCommentText] = useState("");
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  // Comment hint state
  const [hasSeenCommentHint, setHasSeenCommentHint] = useState(false);
  const [showCommentHint, setShowCommentHint] = useState(false);

  // Sidebar filter state - true = show resolved, false = show active
  const [showResolved, setShowResolved] = useState(false);

  const isSidebarOpen = mode === "comment" || selectedPinId !== null;
  const isNameValid = authorName.trim().length > 0;

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
      // Image mode - load author name from localStorage
      const savedAuthor = localStorage.getItem(AUTHOR_KEY);
      if (savedAuthor) {
        setAuthorName(savedAuthor);
      }
      setViewMode("image");
      setCurrentImageId(imageParam);
    } else if (urlParam) {
      // URL mode with query param - load author name from localStorage
      const savedAuthor = localStorage.getItem(AUTHOR_KEY);
      if (savedAuthor) {
        setAuthorName(savedAuthor);
      }
      const normalizedUrl = normalizeUrl(urlParam);
      setViewMode("url");
      setCurrentUrl(normalizedUrl);
      setUrlInput(getDisplayUrl(normalizedUrl));
      updateBrowserUrl({ url: getDisplayUrl(normalizedUrl) });
    } else {
      // Landing page - do NOT pre-fill any inputs from localStorage
      // Both URL and name inputs should be empty
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

  // Save author name to localStorage
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
    };

    window.addEventListener("keydown", handleCommentShortcut);
    return () => window.removeEventListener("keydown", handleCommentShortcut);
  }, [mode, viewMode]);

  // Handle comment mode hint visibility
  useEffect(() => {
    if (mode === "comment" && !newCommentPos) {
      // Entering comment mode without a comment placed
      if (!hasSeenCommentHint) {
        setShowCommentHint(true);
        // Auto-dismiss after 3 seconds
        const timer = setTimeout(() => {
          setShowCommentHint(false);
          setHasSeenCommentHint(true);
        }, 3000);
        return () => clearTimeout(timer);
      }
    } else {
      // Exiting comment mode or comment placed
      setShowCommentHint(false);
    }
  }, [mode, newCommentPos, hasSeenCommentHint]);

  // Navigate to URL mode
  const navigateToUrl = useCallback((newUrl: string) => {
    const normalizedUrl = normalizeUrl(newUrl);

    // If navigating from landing and user hasn't entered a name, load from localStorage
    if (viewMode === "landing" && !authorName.trim()) {
      const savedAuthor = localStorage.getItem(AUTHOR_KEY);
      if (savedAuthor) {
        setAuthorName(savedAuthor);
      }
    }

    setViewMode("url");
    setCurrentUrl(normalizedUrl);
    setUrlInput(getDisplayUrl(normalizedUrl));
    setIframeError(false);
    setNewCommentPos(null);
    setSelectedPinId(null);
    setCurrentImageId(null);
    setImageDoc(null);

    updateBrowserUrl({ url: getDisplayUrl(normalizedUrl), image: null });
  }, [viewMode, authorName, setAuthorName, setViewMode, setUrlInput]);

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

  // Focus name input
  const focusNameInput = () => {
    nameInputRef.current?.focus();
  };

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

    if (mode === "comment") {
      if (!isNameValid) {
        focusNameInput();
        return;
      }

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
    if (!newCommentPos || !newCommentText.trim() || !currentTargetId) return;

    if (!isNameValid) {
      focusNameInput();
      return;
    }

    try {
      const commentData: Record<string, unknown> = {
        targetType: currentTargetType,
        targetId: currentTargetId,
        x: newCommentPos.x,
        y: newCommentPos.y,
        text: newCommentText.trim(),
        author: authorName.trim(),
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
      // Exit comment mode after posting
      setMode("browse");
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
    } catch (error) {
      console.error("Error editing comment:", error);
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
    <div className="flex flex-1 flex-col bg-[#0A0A0F]">
      {/* Landing page content */}
      {isLanding && (
        <>
          {/* Body - centered muted text */}
          <div className="flex flex-1 items-center justify-center">
            <p className="text-[14px] font-normal text-[#4A4A52]">
              Enter your demo site URL to start commenting
            </p>
          </div>

          {/* Muted FAB */}
          <div
            className="fixed bottom-6 right-6 z-50 flex items-center justify-center rounded-full opacity-50 cursor-not-allowed"
            style={{ width: "52px", height: "52px", backgroundColor: "#6E5BFF" }}
          >
            <MessageCircle className="h-[22px] w-[22px] text-white" strokeWidth={2.5} />
          </div>
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
                    <div className="flex h-[500px] w-full flex-col items-center justify-center bg-[#0A0A0F] text-center">
                      <div className="rounded-xl border border-[#1F1F26] bg-[#1A1A22] p-8">
                        <div className="mb-4 text-4xl">🚫</div>
                        <h2 className="mb-2 text-xl font-semibold text-white">
                          This site cannot be embedded
                        </h2>
                        <p className="mb-4 max-w-md text-[#6B6B75]">
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
                          className="rounded-full bg-[#22222C] px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#2A2A33]"
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

                  {/* Comment Pins - filtered by resolved state */}
                  {comments
                    .filter((comment) => comment.resolved === showResolved)
                    .map((comment) => (
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
                        onResolve={handleResolveComment}
                        onReopen={handleReopenComment}
                        sidebarClickedRef={sidebarClickedRef}
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
                      <div className="w-64 rounded-xl border border-[#1F1F26] bg-[#1A1A22] p-3 shadow-xl">
                        <input
                          ref={newCommentInputRef}
                          value={newCommentText}
                          onChange={(e) => setNewCommentText(e.target.value)}
                          className="w-full rounded-lg border-none bg-[#22222C] px-3 py-2 text-sm text-white outline-none transition-all placeholder:text-[#6B6B75] focus:ring-2 focus:ring-[#6E5BFF]/25"
                          placeholder="Add a comment..."
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handlePostComment();
                            if (e.key === "Escape") handleCancelNewComment();
                          }}
                        />
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-[11px] text-[#6B6B75]">
                            Posting as {authorName}
                          </span>
                          <div className="flex gap-2">
                            <button
                              onClick={handleCancelNewComment}
                              className="rounded-full bg-[#22222C] px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-[#2A2A33]"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handlePostComment}
                              disabled={!newCommentText.trim()}
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
                <div className="flex items-center justify-center bg-[#0A0A0F] p-8" style={{ minHeight: `calc(100vh - ${NAV_HEIGHT}px)` }}>
                  {isLoadingImage ? (
                    <div className="text-[#6B6B75]">Loading image...</div>
                  ) : imageError ? (
                    <div className="text-center">
                      <div className="mb-4 text-4xl">🖼️</div>
                      <h2 className="mb-2 text-xl font-semibold text-white">
                        {imageError}
                      </h2>
                      <p className="mb-4 text-[#6B6B75]">
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
                      className="relative overflow-hidden rounded-lg border border-[#1F1F26] shadow-2xl shadow-black/50"
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

                      {/* Comment Pins - filtered by resolved state */}
                      {comments
                        .filter((comment) => comment.resolved === showResolved)
                        .map((comment) => (
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
                            onResolve={handleResolveComment}
                            onReopen={handleReopenComment}
                            sidebarClickedRef={sidebarClickedRef}
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
                          <div className="w-64 rounded-xl border border-[#1F1F26] bg-[#1A1A22] p-3 shadow-xl">
                            <input
                              ref={newCommentInputRef}
                              value={newCommentText}
                              onChange={(e) => setNewCommentText(e.target.value)}
                              className="w-full rounded-lg border-none bg-[#22222C] px-3 py-2 text-sm text-white outline-none transition-all placeholder:text-[#6B6B75] focus:ring-2 focus:ring-[#6E5BFF]/25"
                              placeholder="Add a comment..."
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handlePostComment();
                                if (e.key === "Escape") handleCancelNewComment();
                              }}
                            />
                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-[11px] text-[#6B6B75]">
                                Posting as {authorName}
                              </span>
                              <div className="flex gap-2">
                                <button
                                  onClick={handleCancelNewComment}
                                  className="rounded-full bg-[#22222C] px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-[#2A2A33]"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={handlePostComment}
                                  disabled={!newCommentText.trim()}
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
                  <div className="rounded-full bg-[#6E5BFF] px-3 py-1.5 text-xs font-medium text-white shadow-lg">
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
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#6E5BFF] shadow-lg">
                    <MessageCircle className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
                  </div>
                </div>
              )
            )}

            {/* Comment mode hint overlay at bottom */}
            {mode === "comment" && !newCommentPos && showCommentHint && (
              <div
                className="fixed bottom-20 left-1/2 z-[100] -translate-x-1/2 cursor-pointer transition-opacity duration-300"
                onClick={() => {
                  setShowCommentHint(false);
                  setHasSeenCommentHint(true);
                }}
              >
                <div className="rounded-full border border-[#1F1F26] bg-[#1A1A22] px-4 py-2 shadow-lg">
                  <p className="text-[13px] text-white">
                    Click anywhere to place a comment{" "}
                    <span className="text-[#6B6B75]">·</span>{" "}
                    Press{" "}
                    <kbd className="inline-flex items-center justify-center rounded bg-[#22222C] px-1.5 py-0.5 font-mono text-[10px] font-medium text-white">
                      Esc
                    </kbd>{" "}
                    to cancel
                  </p>
                </div>
              </div>
            )}

            {/* Comments Sidebar */}
            <div
              ref={sidebarRef}
              data-sidebar
              className={cn(
                "fixed right-0 bottom-0 flex flex-col border-l border-[#1F1F26] bg-[#0F0F15] transition-all duration-300 z-40",
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
                const resolvedComments = comments.filter((c) => c.resolved);

                // Filter logic: show EITHER active OR resolved, never both
                const filteredComments = showResolved ? resolvedComments : activeComments;

                // Header label and count
                const headerLabel = showResolved ? "RESOLVED" : "COMMENTS";
                const headerCount = filteredComments.length;

                // Empty state logic
                const showEmptyState = filteredComments.length === 0;
                const emptyStateText = showResolved
                  ? "No resolved comments yet."
                  : "No comments yet. Press C to add one.";

                return (
                  <>
                    {/* Header with close button */}
                    <div className="flex items-center justify-between px-4 pt-4 pb-2">
                      <h2 className="text-[11px] font-medium uppercase tracking-[1px] text-[#6B6B75]">
                        {headerLabel}{headerCount > 0 && ` · ${headerCount}`}
                      </h2>
                      <button
                        onClick={() => {
                          setMode("browse");
                          setSelectedPinId(null);
                          setNewCommentPos(null);
                        }}
                        className="text-[#6B6B75] transition-colors hover:text-white"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Single Resolved toggle button */}
                    <div className="flex gap-1.5 px-4 pb-3">
                      <button
                        onClick={() => setShowResolved(!showResolved)}
                        className={cn(
                          "rounded-full text-[12px] font-medium text-white transition-all duration-150",
                          showResolved
                            ? "border border-transparent bg-[#6E5BFF] px-3 py-[5px]"
                            : "border border-[#2A2D38] bg-transparent px-3 py-[5px] hover:border-[#3A3D48]"
                        )}
                      >
                        Resolved
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 pb-4">
                      {isLoadingComments ? (
                        <div className="flex h-full items-center justify-center">
                          <p className="text-center text-[13px] text-[#6B6B75]">
                            Loading comments...
                          </p>
                        </div>
                      ) : showEmptyState ? (
                        <div className="flex h-full flex-col items-center justify-center py-10">
                          <p className="text-center text-[13px] text-[#4A4A52]">
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
                                      "cursor-pointer rounded-xl px-3.5 py-2.5 transition-all duration-150 bg-[#1A1A22]",
                                      isSelected ? "opacity-100" : isHovered ? "opacity-85" : "opacity-70"
                                    )}
                                  >
                                    <p className="text-[13px] font-medium leading-relaxed text-[#6B6B75]">
                                      {comment.text}
                                    </p>
                                    <div className="mt-1 flex items-center gap-1 text-[11px] text-[#6B6B75]">
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
                                        ? "bg-[#22222C]"
                                        : "bg-[#1A1A22] hover:bg-[#22222C]"
                                  )}
                                >
                                  <p className={cn(
                                    "text-[13px] font-medium leading-relaxed",
                                    isSelected ? "text-white" : "text-white"
                                  )}>
                                    {comment.text}
                                  </p>
                                  <div className={cn(
                                    "mt-1 flex items-center gap-2 text-[11px]",
                                    isSelected ? "text-[#D6D0FF]" : "text-[#6B6B75]"
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

          {/* Floating Action Button */}
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
              "bg-[#6E5BFF] text-white shadow-[0_4px_16px_rgba(0,0,0,0.4)]",
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
              <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-white px-1 text-[11px] font-medium text-[#0A0A0F]">
                {comments.filter((c) => !c.resolved).length}
              </span>
            )}
          </button>
        </>
      )}
    </div>
  );
}
