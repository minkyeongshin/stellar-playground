"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { X, ImageIcon, MessageCircle, ArrowUp } from "lucide-react";
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
type ViewMode = "landing" | "url" | "image";

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
  const adjustedX = comment.containerWidth && currentContainerWidth > 0
    ? (comment.x * comment.containerWidth / currentContainerWidth)
    : comment.x;
  const [isLocalHover, setIsLocalHover] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);

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
  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>("landing");
  const [isHydrated, setIsHydrated] = useState(false);

  // URL mode state
  const [currentUrl, setCurrentUrl] = useState(DEFAULT_URL);
  const [urlInput, setUrlInput] = useState("");
  const [iframeError, setIframeError] = useState(false);
  const [isUrlFocused, setIsUrlFocused] = useState(false);

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
  const [authorName, setAuthorName] = useState("");
  const [newCommentPos, setNewCommentPos] = useState<{ x: number; y: number } | null>(null);
  const [newCommentText, setNewCommentText] = useState("");
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  // Landing page state
  const [landingUrlInput, setLandingUrlInput] = useState("");

  const isSidebarOpen = mode === "comment" || selectedPinId !== null;
  const isNameValid = authorName.trim().length > 0;

  const containerRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const newCommentInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isUrlCommittedRef = useRef(false);

  // Determine current target for comments
  const currentTargetType: "url" | "image" = viewMode === "image" ? "image" : "url";
  const currentTargetId = viewMode === "image" ? currentImageId : getHostname(currentUrl);

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

    // Load author name
    const savedAuthor = localStorage.getItem(AUTHOR_KEY);
    if (savedAuthor) {
      setAuthorName(savedAuthor);
    }

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
      // Check localStorage for saved URL
      const savedUrl = localStorage.getItem(URL_KEY);
      if (savedUrl) {
        // Show landing page but pre-fill the URL input
        setLandingUrlInput(getDisplayUrl(savedUrl));
      }
      setViewMode("landing");
    }

    setIsHydrated(true);
  }, []);

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
  }, []);

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

  // Handle URL input blur
  const handleUrlBlur = () => {
    setIsUrlFocused(false);
    if (isUrlCommittedRef.current) {
      isUrlCommittedRef.current = false;
      return;
    }
    setUrlInput(getDisplayUrl(currentUrl));
  };

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

  // Go back to landing
  const goToLanding = () => {
    setViewMode("landing");
    setMode("browse");
    setSelectedPinId(null);
    setNewCommentPos(null);
    setComments([]);
    updateBrowserUrl({ url: null, image: null });
    window.history.replaceState({}, "", window.location.pathname);
  };

  const isLanding = viewMode === "landing";
  const landingUrlInputRef = useRef<HTMLInputElement>(null);

  // Autofocus URL input on landing page
  useEffect(() => {
    if (isLanding && isHydrated && landingUrlInputRef.current) {
      landingUrlInputRef.current.focus();
    }
  }, [isLanding, isHydrated]);

  // Handle landing URL input key events
  const handleLandingUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (landingUrlInput.trim()) {
        navigateToUrl(landingUrlInput);
      }
    }
  };

  // Render landing page with Quick branding
  if (isLanding) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#5B4FE9] px-4 py-8">
        <div className="flex flex-col items-center">
          {/* Quick wordmark */}
          <h1
            className="mb-10 select-none text-center font-serif text-[64px] font-black italic leading-none text-white sm:text-[96px]"
            style={{
              WebkitTextStroke: "3px #000",
              textShadow: "6px 6px 0 #000",
              transform: "rotate(-2deg)",
              letterSpacing: "-2px",
            }}
          >
            Quick
          </h1>

          {/* Input card */}
          <div
            className="w-full max-w-[520px] rounded-[20px] border-4 border-black bg-white px-8 py-12 sm:px-14"
            style={{ boxShadow: "10px 10px 0 #000" }}
          >
            {/* Upload icon */}
            <div className="mx-auto mb-6 flex h-[72px] w-[72px] items-center justify-center rounded-2xl border-[3px] border-black bg-[#5B4FE9]">
              <ArrowUp className="h-9 w-9 text-white" strokeWidth={3} />
            </div>

            {/* Heading */}
            <h2
              className="mb-2 text-center font-mono text-2xl font-bold uppercase tracking-[2px] text-black sm:text-[28px]"
              style={{ fontFamily: "'Courier New', Courier, monospace" }}
            >
              DROP YOUR URL HERE
            </h2>

            {/* Subheading */}
            <p
              className="mb-6 text-center font-mono text-sm uppercase tracking-[2px] text-[#888]"
              style={{ fontFamily: "'Courier New', Courier, monospace" }}
            >
              COMMENT • SHARE • SHIP
            </p>

            {/* Input + Button row */}
            <div className="flex gap-2.5">
              <input
                ref={landingUrlInputRef}
                type="text"
                value={landingUrlInput}
                onChange={(e) => setLandingUrlInput(e.target.value)}
                onKeyDown={handleLandingUrlKeyDown}
                className="flex-1 rounded-[10px] border-2 border-black bg-[#F5F3FF] px-4 py-3 font-mono text-[15px] text-black outline-none placeholder:text-gray-400"
                style={{ fontFamily: "'Courier New', Courier, monospace" }}
                placeholder="https://yourproject.vercel.app"
              />
              <button
                type="button"
                onClick={() => {
                  if (landingUrlInput.trim()) {
                    navigateToUrl(landingUrlInput);
                  }
                }}
                className="rounded-[10px] border-2 border-black bg-[#5B4FE9] px-6 py-3 font-mono text-[15px] font-bold uppercase tracking-[1px] text-white transition-all hover:-translate-x-px hover:-translate-y-px active:translate-x-0.5 active:translate-y-0.5"
                style={{
                  fontFamily: "'Courier New', Courier, monospace",
                  boxShadow: "4px 4px 0 #000",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = "5px 5px 0 #000";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "4px 4px 0 #000";
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.boxShadow = "2px 2px 0 #000";
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.boxShadow = "5px 5px 0 #000";
                }}
              >
                GO →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render viewing page (unchanged)
  return (
    <div className="flex min-h-screen flex-col bg-slate-950">
      {/* Header for viewing page */}
      <header className="sticky top-0 z-50 flex flex-wrap items-center gap-4 border-b border-white/10 bg-slate-950/95 px-4 py-3 backdrop-blur-md">
        {/* Logo + Badge */}
        <button
          onClick={goToLanding}
          className="flex items-center gap-2 transition-opacity hover:opacity-80"
        >
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
        </button>

        {/* Viewing: URL Input */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Viewing:</span>
          <div className="relative">
            {viewMode === "url" ? (
              // URL viewing mode: editable URL with clear button
              <>
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
                      goToLanding();
                    }}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-500 hover:text-white transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            ) : viewMode === "image" && imageDoc ? (
              // Image viewing mode: show filename with clear button
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-slate-400" />
                <span className="text-sm text-slate-300">{imageDoc.fileName}</span>
                <button
                  type="button"
                  onClick={goToLanding}
                  className="p-0.5 text-slate-500 hover:text-white transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              // Image loading state
              <span className="text-sm text-slate-500">Loading...</span>
            )}
          </div>
        </div>

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
      </header>

      {/* Main Content Area with Sidebar */}
      <div className="flex">
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
                <div className="flex h-[500px] w-full flex-col items-center justify-center bg-slate-900 text-center">
                  <div className="rounded-lg border border-white/10 bg-white/5 p-8 backdrop-blur-md">
                    <div className="text-4xl mb-4">🚫</div>
                    <h2 className="text-xl font-semibold text-white mb-2">
                      This site cannot be embedded
                    </h2>
                    <p className="text-slate-400 max-w-md mb-4">
                      Try uploading a screenshot instead, or open{" "}
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
                    <Button
                      onClick={goToLanding}
                      variant="outline"
                      className="border-white/20 text-white hover:bg-white/10"
                    >
                      Upload Screenshot Instead
                    </Button>
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

              {/* Comment Pins */}
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
          )}

          {/* Image Mode */}
          {viewMode === "image" && (
            <div className="flex items-center justify-center min-h-[calc(100vh-57px)] bg-slate-900/50 p-8">
              {isLoadingImage ? (
                <div className="text-slate-400">Loading image...</div>
              ) : imageError ? (
                <div className="text-center">
                  <div className="text-4xl mb-4">🖼️</div>
                  <h2 className="text-xl font-semibold text-white mb-2">
                    {imageError}
                  </h2>
                  <p className="text-slate-400 mb-4">
                    This image may have been deleted or the link is invalid.
                  </p>
                  <Button
                    onClick={goToLanding}
                    className="bg-purple-600 text-white hover:bg-purple-700"
                  >
                    Go Back
                  </Button>
                </div>
              ) : imageDoc ? (
                <div
                  ref={imageContainerRef}
                  className="relative rounded-lg shadow-2xl shadow-black/50 border border-white/10 overflow-hidden"
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

                  {/* Comment Pins */}
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

        {/* Comment mode hint overlay at bottom */}
        {mode === "comment" && !newCommentPos && (
          <div className="pointer-events-none fixed bottom-20 left-1/2 z-[100] -translate-x-1/2">
            <div className="rounded-lg bg-slate-900/95 px-4 py-2 shadow-lg backdrop-blur-sm border border-white/10">
              <p className="text-sm text-slate-300">
                Click anywhere to place a comment{" "}
                <span className="text-slate-500">·</span>{" "}
                Press{" "}
                <kbd className="inline-flex items-center justify-center rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-300">
                  Esc
                </kbd>{" "}
                to cancel
              </p>
            </div>
          </div>
        )}

        {/* Comments Sidebar */}
        <div
          className={cn(
            "fixed right-0 top-[57px] bottom-0 flex flex-col border-l border-white/10 bg-slate-900/95 backdrop-blur-md transition-all duration-300 z-40",
            isSidebarOpen ? "w-80" : "w-0"
          )}
        >
          {isSidebarOpen && (
            <>
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

              <div className="flex-1 overflow-y-auto">
                {isLoadingComments ? (
                  <div className="flex h-full items-center justify-center p-4">
                    <p className="text-center text-sm text-slate-500">
                      Loading comments...
                    </p>
                  </div>
                ) : comments.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center p-6">
                    <MessageCircle className="h-12 w-12 text-slate-600 mb-4" />
                    <h3 className="text-sm font-medium text-slate-300 mb-2">No comments yet</h3>
                    <p className="text-center text-xs text-slate-500">
                      Press{" "}
                      <kbd className="inline-flex items-center justify-center rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-300">
                        C
                      </kbd>{" "}
                      to start commenting
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
            "fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full transition-all duration-150 ease-out",
            "bg-purple-600 text-white shadow-[0_4px_16px_rgba(0,0,0,0.4)]",
            "hover:scale-105 hover:bg-purple-500"
          )}
        >
          {isSidebarOpen ? (
            <X className="h-6 w-6" />
          ) : (
            <MessageCircle className="h-6 w-6" />
          )}
          {/* Comment count badge */}
          {!isSidebarOpen && comments.length > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-xs font-bold text-purple-600">
              {comments.length}
            </span>
          )}
        </button>

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
