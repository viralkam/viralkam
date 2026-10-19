import React, { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import {
  LayoutDashboard,
  Film,
  UploadCloud,
  FolderOpen,
  ArrowLeft,
  Search,
  Eye,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Plus,
  Play,
  X,
  FileSpreadsheet,
  Link as LinkIcon,
  Layers,
  Download,
  Loader2,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink
} from "lucide-react";
import { api } from "../services/api";
import { cleanDisplayTitle, cleanVideoUrl, FALLBACK_THUMBNAIL } from "../utils/format";
import "./AdminPanel.css";

export default function AdminPanel({
  videos: initialVideos = [],
  categories: initialCategories = [],
  onAddVideo,
  onUpdateVideo,
  onDeleteVideo,
  onExitAdmin,
  onViewVideo
}) {
  // Navigation: "dashboard" | "videos" | "upload" | "categories" | "edit"
  const [activeNav, setActiveNav] = useState("dashboard");

  // Notifications
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setErrorMsg("");
    setTimeout(() => setSuccessMsg(""), 4000);
  };

  const showError = (msg) => {
    setErrorMsg(msg);
    setSuccessMsg("");
    setTimeout(() => setErrorMsg(""), 5000);
  };

  // Live Stats from Database
  const [stats, setStats] = useState({
    totalVideos: initialVideos.length,
    totalViews: initialVideos.reduce((sum, v) => sum + (v.views || 0), 0),
    totalCategories: initialCategories.length,
    recentVideos: initialVideos.slice(0, 6)
  });

  // Live Categories from Database
  const [categoriesList, setCategoriesList] = useState([]);
  const [newCatName, setNewCatName] = useState("");
  const [editingCatId, setEditingCatId] = useState(null);
  const [editingCatName, setEditingCatName] = useState("");

  // Videos management state
  const [videosList, setVideosList] = useState(initialVideos);
  const [videosCount, setVideosCount] = useState(initialVideos.length);
  const [videosPage, setVideosPage] = useState(1);
  const [videosLimit] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [selectedVideoIds, setSelectedVideoIds] = useState([]);

  // Video Preview Modal
  const [previewVideo, setPreviewVideo] = useState(null);

  // Edit Video State
  const [editingVideo, setEditingVideo] = useState(null);
  const [editFile, setEditFile] = useState(null);
  const [editThumbnailFile, setEditThumbnailFile] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Upload Video Tab: 1=single, 2=bulk, 3=link, 4=excel
  const [uploadTab, setUploadTab] = useState("single");

  // Single Upload Form State (supports both local file upload & direct CDN link)
  const [singleSourceType, setSingleSourceType] = useState("file"); // "file" | "link"
  const [singleFile, setSingleFile] = useState(null);
  const [singleVideoUrl, setSingleVideoUrl] = useState("");
  const [singleTitle, setSingleTitle] = useState("");
  const [singleDescription, setSingleDescription] = useState("");
  const [singleCategory, setSingleCategory] = useState("General");
  const [singleTags, setSingleTags] = useState([]);
  const [singleTagInput, setSingleTagInput] = useState("");
  const [singleThumbnail, setSingleThumbnail] = useState("");
  const [singleThumbnailFile, setSingleThumbnailFile] = useState(null);
  const [singleThumbnailUrl, setSingleThumbnailUrl] = useState("");
  const [singleDuration, setSingleDuration] = useState("");
  const [singleInitialViews, setSingleInitialViews] = useState("");
  const [singleInitialLikes, setSingleInitialLikes] = useState("");
  const [singlePrivacy, setSinglePrivacy] = useState("public");
  const [isUploadingSingle, setIsUploadingSingle] = useState(false);

  // Bulk Upload Form State
  const [bulkFiles, setBulkFiles] = useState([]);
  const [bulkDefaultCategory, setBulkDefaultCategory] = useState("General");
  const [bulkDefaultPrivacy, setBulkDefaultPrivacy] = useState("public");
  const [bulkOverallProgress, setBulkOverallProgress] = useState(0);
  const [isUploadingBulk, setIsUploadingBulk] = useState(false);

  // Link Upload Form State (Direct CDN/External link - no duplicate storage)
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkDescription, setLinkDescription] = useState("");
  const [linkCategory, setLinkCategory] = useState("General");
  const [linkTags, setLinkTags] = useState([]);
  const [linkTagInput, setLinkTagInput] = useState("");
  const [linkThumbnail, setLinkThumbnail] = useState("");
  const [linkDuration, setLinkDuration] = useState("");
  const [linkInitialViews, setLinkInitialViews] = useState("");
  const [linkInitialLikes, setLinkInitialLikes] = useState("");
  const [linkPrivacy, setLinkPrivacy] = useState("public");
  const [isImportingLink, setIsImportingLink] = useState(false);

  // Excel Upload Form State
  const [excelFile, setExcelFile] = useState(null);
  const [excelParsedRows, setExcelParsedRows] = useState([]);
  const [excelValidationErrors, setExcelValidationErrors] = useState([]);
  const [isImportingExcel, setIsImportingExcel] = useState(false);
  const [excelProgress, setExcelProgress] = useState(0);

  // Ref for hidden file inputs
  const singleVideoInputRef = useRef(null);
  const singleThumbInputRef = useRef(null);
  const bulkVideoInputRef = useRef(null);
  const excelInputRef = useRef(null);
  const editVideoInputRef = useRef(null);
  const editThumbInputRef = useRef(null);

  // Fetch Stats and Categories on load
  const loadStatsAndCategories = async () => {
    try {
      const statsData = await api.getAdminStats();
      if (statsData) {
        setStats(statsData);
      }
    } catch {}

    try {
      const cats = await api.getCategories();
      if (cats && cats.length > 0) {
        setCategoriesList(cats);
        if (!singleCategory && cats[0]) {
          setSingleCategory(cats[0].name);
        }
      }
    } catch {}
  };

  useEffect(() => {
    loadStatsAndCategories();
  }, []);

  // Fetch paginated videos for "Videos" and "Dashboard"
  const loadVideos = async () => {
    setIsLoadingVideos(true);
    try {
      const res = await api.getVideos({
        page: videosPage,
        limit: videosLimit,
        search: searchQuery,
        category: filterCategory === "all" ? "" : filterCategory,
        privacy: filterStatus === "all" ? "" : filterStatus,
        status: filterStatus === "all" ? "" : filterStatus
      });
      if (res && res.videos) {
        setVideosList(res.videos);
        if (res.pagination) {
          setVideosCount(res.pagination.totalVideos);
        }
      }
    } catch (err) {
      console.warn("Could not load videos:", err);
    } finally {
      setIsLoadingVideos(false);
    }
  };

  useEffect(() => {
    if (activeNav === "videos" || activeNav === "dashboard") {
      loadVideos();
    }
  }, [videosPage, filterCategory, filterStatus, activeNav]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setVideosPage(1);
    loadVideos();
  };

  // Auto Duration & Thumbnail frame helper (supports both File object and video URL string)
  const detectVideoMeta = (input) => {
    return new Promise((resolve) => {
      try {
        let url = "";
        let isObjectUrl = false;
        if (typeof input === "string") {
          url = input.trim();
        } else if (input instanceof Blob || input instanceof File) {
          url = URL.createObjectURL(input);
          isObjectUrl = true;
        } else {
          return resolve({ duration: "", thumbnail: "" });
        }

        if (!url) return resolve({ duration: "", thumbnail: "" });

        const video = document.createElement("video");
        video.preload = "metadata";
        video.crossOrigin = "anonymous";
        video.src = url;

        const cleanup = () => {
          if (isObjectUrl) {
            try { URL.revokeObjectURL(url); } catch {}
          }
        };

        const formatSecs = (totalSec) => {
          const sec = Math.floor(totalSec) || 0;
          if (sec <= 0) return "";
          const hrs = Math.floor(sec / 3600);
          const mins = Math.floor((sec % 3600) / 60);
          const remSec = sec % 60;
          if (hrs > 0) {
            return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(remSec).padStart(2, "0")}`;
          }
          return `${String(mins).padStart(2, "0")}:${String(remSec).padStart(2, "0")}`;
        };

        const timeout = setTimeout(() => {
          cleanup();
          resolve({ duration: "", thumbnail: "" });
        }, 8000);

        video.onloadedmetadata = () => {
          const durStr = formatSecs(video.duration);
          try {
            video.currentTime = Math.min(2.0, Math.max(0.5, video.duration / 4));
          } catch {
            clearTimeout(timeout);
            cleanup();
            resolve({ duration: durStr, thumbnail: "" });
          }
        };

        video.onseeked = () => {
          clearTimeout(timeout);
          let thumbData = "";
          try {
            const canvas = document.createElement("canvas");
            canvas.width = 480;
            canvas.height = 270;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            thumbData = canvas.toDataURL("image/jpeg", 0.7);
          } catch {}

          const durStr = formatSecs(video.duration);
          cleanup();
          resolve({ duration: durStr, thumbnail: thumbData });
        };

        video.onerror = () => {
          clearTimeout(timeout);
          cleanup();
          resolve({ duration: "", thumbnail: "" });
        };
      } catch {
        resolve({ duration: "", thumbnail: "" });
      }
    });
  };

  // ==========================================
  // SINGLE UPLOAD HANDLERS
  // ==========================================
  const handleSingleFileSelect = async (file) => {
    if (!file) return;
    setSingleFile(file);

    // Auto-fill title if empty
    if (!singleTitle) {
      const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
      setSingleTitle(cleanName);
    }

    // Auto-detect duration and thumbnail frame
    const meta = await detectVideoMeta(file);
    if (meta.duration) setSingleDuration(meta.duration);
    if (meta.thumbnail && !singleThumbnail && !singleThumbnailUrl) {
      setSingleThumbnail(meta.thumbnail);
    }
  };

  const handleSingleVideoUrlChange = (val) => {
    let clean = (val || "").trim();
    const iframeMatch = clean.match(/src=["']([^"']+)["']/i);
    if (iframeMatch && iframeMatch[1]) {
      clean = iframeMatch[1];
    }
    setSingleVideoUrl(clean);

    // Auto extract YouTube ID and thumbnail
    const ytMatch = clean.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
    if (ytMatch && ytMatch[1]) {
      const ytId = ytMatch[1];
      if (!singleThumbnail && !singleThumbnailUrl) {
        setSingleThumbnail(`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`);
      }
    }

    // Auto suggest clean title from URL if title is empty
    if (!singleTitle && clean) {
      const suggested = cleanDisplayTitle(clean);
      if (suggested && suggested !== "Untitled Video") {
        setSingleTitle(suggested);
      }
    }

    // Auto detect duration and thumbnail frame from direct video link
    if (clean && (clean.startsWith("http://") || clean.startsWith("https://"))) {
      detectVideoMeta(clean).then((meta) => {
        if (meta.duration) {
          setSingleDuration(meta.duration);
        }
        if (meta.thumbnail && !singleThumbnail && !singleThumbnailUrl) {
          setSingleThumbnail(meta.thumbnail);
        }
      });
    }
  };

  const handleAddSingleTag = () => {
    const trimmed = singleTagInput.trim().replace(/^,|,$/g, "");
    if (trimmed && !singleTags.includes(trimmed)) {
      setSingleTags([...singleTags, trimmed]);
      setSingleTagInput("");
    }
  };

  const handleRemoveSingleTag = (index) => {
    setSingleTags(singleTags.filter((_, i) => i !== index));
  };

  const handleSingleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!singleTitle.trim()) {
      showError("Please enter a video title.");
      return;
    }

    if (singleSourceType === "file" && !singleFile) {
      showError("Please select a video file from your device.");
      return;
    }

    if (singleSourceType === "link" && !singleVideoUrl.trim()) {
      showError("Please enter a direct video URL.");
      return;
    }

    setIsUploadingSingle(true);
    try {
      let finalVideoUrl = "";
      if (singleSourceType === "file") {
        // Upload file to user's server storage / Cloudflare R2
        finalVideoUrl = await api.uploadVideoFile(singleFile);
      } else {
        // Direct CDN / external link - runs directly without duplicating to server storage
        finalVideoUrl = cleanVideoUrl(singleVideoUrl.trim());
      }

      let finalThumbnailUrl = singleThumbnailUrl.trim() || singleThumbnail;
      if (singleThumbnailFile) {
        // Upload custom image to user's server storage
        finalThumbnailUrl = await api.uploadVideoFile(singleThumbnailFile);
      }

      if (!finalThumbnailUrl) {
        finalThumbnailUrl = FALLBACK_THUMBNAIL;
      }

      const initialViewsNum = parseInt(singleInitialViews, 10) || 0;
      const initialLikesNum = parseInt(singleInitialLikes, 10) || 0;

      const newVideo = {
        title: singleTitle.trim(),
        description: singleDescription.trim() || `Watch ${singleTitle.trim()} on platform`,
        category: singleCategory || "General",
        tags: singleTags.length > 0 ? singleTags : [singleCategory, "Trending"],
        duration: singleDuration.trim() || "",
        videoUrl: finalVideoUrl,
        thumbnail: finalThumbnailUrl,
        privacy: singlePrivacy,
        status: singlePrivacy === "private" ? "private" : "published",
        initial_views: initialViewsNum,
        initial_likes: initialLikesNum,
        views: initialViewsNum,
        likes: initialLikesNum,
        author: "Admin",
        uploadedAt: "Just now"
      };

      const saved = await api.createVideo(newVideo);
      if (onAddVideo) onAddVideo(saved || newVideo);

      showSuccess(`Video "${singleTitle}" saved and published successfully!`);

      // Reset single upload form
      setSingleFile(null);
      setSingleVideoUrl("");
      setSingleTitle("");
      setSingleDescription("");
      setSingleTags([]);
      setSingleThumbnail("");
      setSingleThumbnailFile(null);
      setSingleThumbnailUrl("");
      setSingleInitialViews("");
      setSingleInitialLikes("");
      setSingleDuration("");
      setSinglePrivacy("public");

      // Reload stats & videos, navigate to videos tab
      loadStatsAndCategories();
      setTimeout(() => {
        setActiveNav("videos");
      }, 1000);
    } catch (err) {
      showError(err.message || "Failed to upload video.");
    } finally {
      setIsUploadingSingle(false);
    }
  };

  // ==========================================
  // BULK UPLOAD HANDLERS
  // ==========================================
  const handleBulkFilesSelect = async (filesList) => {
    if (!filesList || filesList.length === 0) return;

    const newItems = [];
    for (let i = 0; i < filesList.length; i++) {
      const file = filesList[i];
      const cleanTitle = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
      newItems.push({
        id: `bulk-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
        file,
        title: cleanTitle,
        category: bulkDefaultCategory || "General",
        privacy: bulkDefaultPrivacy || "public",
        duration: "",
        thumbnail: "",
        status: "pending", // "pending" | "uploading" | "success" | "error"
        progress: 0,
        error: ""
      });
    }

    setBulkFiles((prev) => [...prev, ...newItems]);

    // Detect metadata for each item asynchronously
    for (const item of newItems) {
      detectVideoMeta(item.file).then((meta) => {
        setBulkFiles((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? { ...it, duration: meta.duration || "", thumbnail: meta.thumbnail || "" }
              : it
          )
        );
      });
    }
  };

  const handleBulkUploadAll = async () => {
    if (bulkFiles.length === 0) return;

    setIsUploadingBulk(true);
    setBulkOverallProgress(0);

    let completedCount = 0;
    const total = bulkFiles.length;

    for (let i = 0; i < total; i++) {
      const item = bulkFiles[i];
      if (item.status === "success") {
        completedCount++;
        continue;
      }

      // Mark current item uploading
      setBulkFiles((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: "uploading", progress: 30 } : it))
      );

      try {
        const fileUrl = await api.uploadVideoFile(item.file);

        setBulkFiles((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, progress: 80 } : it))
        );

        const newVideo = {
          title: item.title,
          description: `Watch ${item.title} on platform`,
          category: item.category,
          tags: [item.category, "Bulk Upload"],
          duration: item.duration || "",
          videoUrl: fileUrl,
          thumbnail: item.thumbnail || FALLBACK_THUMBNAIL,
          privacy: item.privacy,
          status: item.privacy === "private" ? "private" : "published",
          initial_views: 0,
          initial_likes: 0,
          views: 0,
          likes: 0,
          author: "Admin",
          uploadedAt: "Just now"
        };

        const saved = await api.createVideo(newVideo);
        if (onAddVideo) onAddVideo(saved || newVideo);

        completedCount++;
        setBulkOverallProgress(Math.round((completedCount / total) * 100));

        setBulkFiles((prev) =>
          prev.map((it) =>
            it.id === item.id ? { ...it, status: "success", progress: 100, error: "" } : it
          )
        );
      } catch (err) {
        setBulkFiles((prev) =>
          prev.map((it) =>
            it.id === item.id ? { ...it, status: "error", error: err.message || "Upload failed" } : it
          )
        );
      }
    }

    setIsUploadingBulk(false);
    showSuccess(`Bulk upload finished! ${completedCount} of ${total} videos processed.`);
    loadStatsAndCategories();
  };

  // ==========================================
  // LINK UPLOAD HANDLERS
  // ==========================================
  const handleLinkUrlChange = (val) => {
    let clean = (val || "").trim();
    // Auto extract iframe src
    const iframeMatch = clean.match(/src=["']([^"']+)["']/i);
    if (iframeMatch && iframeMatch[1]) {
      clean = iframeMatch[1];
    }
    setLinkUrl(clean);

    // Auto extract YouTube ID and thumbnail
    const ytMatch = clean.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
    if (ytMatch && ytMatch[1]) {
      const ytId = ytMatch[1];
      if (!linkThumbnail || linkThumbnail.includes("youtube.com/vi")) {
        setLinkThumbnail(`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`);
      }
    }

    // Auto suggest clean title from URL if title is empty
    if (!linkTitle && clean) {
      const suggested = cleanDisplayTitle(clean);
      if (suggested && suggested !== "Untitled Video") {
        setLinkTitle(suggested);
      }
    }

    // Auto detect duration and thumbnail frame from direct video link
    if (clean && (clean.startsWith("http://") || clean.startsWith("https://"))) {
      detectVideoMeta(clean).then((meta) => {
        if (meta.duration) {
          setLinkDuration(meta.duration);
        }
        if (meta.thumbnail && !linkThumbnail) {
          setLinkThumbnail(meta.thumbnail);
        }
      });
    }
  };

  const handleAddLinkTag = () => {
    const trimmed = linkTagInput.trim().replace(/^,|,$/g, "");
    if (trimmed && !linkTags.includes(trimmed)) {
      setLinkTags([...linkTags, trimmed]);
      setLinkTagInput("");
    }
  };

  const handleLinkImportSubmit = async (e) => {
    e.preventDefault();
    if (!linkUrl.trim()) {
      showError("Please enter a video URL.");
      return;
    }

    const finalCleanUrl = cleanVideoUrl(linkUrl.trim());
    const finalCleanTitle = cleanDisplayTitle(linkTitle.trim() || finalCleanUrl);

    if (!finalCleanTitle) {
      showError("Please enter a video title.");
      return;
    }

    // Validate URL format
    try {
      new URL(finalCleanUrl);
    } catch {
      showError("Invalid Video URL format. Please provide a valid HTTP/HTTPS link.");
      return;
    }

    setIsImportingLink(true);
    try {
      const initialViewsNum = parseInt(linkInitialViews, 10) || 0;
      const initialLikesNum = parseInt(linkInitialLikes, 10) || 0;

      const newVideo = {
        title: finalCleanTitle,
        description: linkDescription.trim() || `Watch ${finalCleanTitle} online.`,
        category: linkCategory || "General",
        tags: linkTags.length > 0 ? linkTags : [linkCategory, "Trending"],
        duration: linkDuration.trim() || "",
        videoUrl: finalCleanUrl,
        thumbnail: linkThumbnail.trim() || FALLBACK_THUMBNAIL,
        privacy: linkPrivacy,
        status: linkPrivacy === "private" ? "private" : "published",
        initial_views: initialViewsNum,
        initial_likes: initialLikesNum,
        views: initialViewsNum,
        likes: initialLikesNum,
        author: "Admin",
        uploadedAt: "Just now"
      };

      const saved = await api.createVideo(newVideo);
      if (onAddVideo) onAddVideo(saved || newVideo);

      showSuccess(`Video "${linkTitle}" imported successfully from link!`);

      // Reset
      setLinkUrl("");
      setLinkTitle("");
      setLinkDescription("");
      setLinkThumbnail("");
      setLinkTags([]);
      setLinkInitialViews("");
      setLinkInitialLikes("");
      setLinkDuration("");
      setLinkPrivacy("public");

      loadStatsAndCategories();
      setTimeout(() => setActiveNav("videos"), 1000);
    } catch (err) {
      showError(err.message || "Failed to import video from link.");
    } finally {
      setIsImportingLink(false);
    }
  };

  // ==========================================
  // EXCEL IMPORT HANDLERS
  // ==========================================
  const handleDownloadExcelTemplate = () => {
    const templateData = [
      {
        "Title": "Sunset Over Mountain 4K",
        "Description": "Cinematic 4K mountain sunset view with calming ambience.",
        "Category": "Nature",
        "Tags": "sunset, nature, 4k, cinematic",
        "Video URL": "https://vjs.zencdn.net/v/oceans.mp4",
        "Duration": "04:30",
        "Initial Views": 1500,
        "Initial Likes": 120,
        "Privacy": "Public"
      },
      {
        "Title": "Full Body Workout at Home",
        "Description": "Quick 10-minute high intensity workout routine.",
        "Category": "Fitness",
        "Tags": "fitness, workout, health",
        "Video URL": "https://vjs.zencdn.net/v/oceans.mp4",
        "Duration": "10:15",
        "Initial Views": 500,
        "Initial Likes": 45,
        "Privacy": "Public"
      },
      {
        "Title": "Private Team Architecture Brief",
        "Description": "Internal roadmap and deployment instructions.",
        "Category": "General",
        "Tags": "internal, roadmap",
        "Video URL": "https://vjs.zencdn.net/v/oceans.mp4",
        "Duration": "15:00",
        "Initial Views": 10,
        "Initial Likes": 2,
        "Privacy": "Private"
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "VideoTemplate");
    XLSX.writeFile(workbook, "video_import_template.xlsx");
  };

  const handleExcelFileSelect = (file) => {
    if (!file) return;
    setExcelFile(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        const parsed = [];
        const errors = [];

        jsonRows.forEach((row, idx) => {
          const rowNum = idx + 2; // header is row 1
          const rowErrors = [];

          // Column mappings (case-insensitive keys)
          const findVal = (names) => {
            for (const key of Object.keys(row)) {
              if (names.some((n) => n.toLowerCase() === key.toLowerCase())) {
                return String(row[key] || "").trim();
              }
            }
            return "";
          };

          let title = findVal(["Title", "Video Title", "Name"]);
          const description = findVal(["Description", "Desc", "Summary"]);
          const category = findVal(["Category", "Cat"]) || "General";
          const tagsStr = findVal(["Tags", "Tag", "Keywords"]);
          let videoUrl = findVal(["Video URL", "VideoUrl", "URL", "Link"]);
          const duration = findVal(["Duration", "Time", "Length"]) || "";
          const initialViews = findVal(["Initial Views", "Views", "InitialViews"]);
          const initialLikes = findVal(["Initial Likes", "Likes", "InitialLikes"]);
          const privacyRaw = findVal(["Privacy", "Status", "Visibility"]) || "Public";
          const thumbnailRaw = findVal(["Thumbnail", "Thumbnail URL", "Thumb", "Poster", "Image"]);

          // Auto-heal path mismatch if user placed URL in Title column or Title is a file path
          if (title && (title.startsWith("http://") || title.startsWith("https://"))) {
            if (!videoUrl) videoUrl = title;
            title = cleanDisplayTitle(title);
          } else if (!title && videoUrl) {
            title = cleanDisplayTitle(videoUrl);
          } else if (title) {
            title = cleanDisplayTitle(title);
          }

          videoUrl = cleanVideoUrl(videoUrl, "https://vjs.zencdn.net/v/oceans.mp4");

          if (!title) {
            rowErrors.push("Title is required");
          }

          const privacyClean = privacyRaw.toLowerCase() === "private" ? "private" : "public";

          if (privacyRaw && !["public", "private"].includes(privacyRaw.toLowerCase())) {
            rowErrors.push(`Invalid Privacy '${privacyRaw}' (must be Public or Private)`);
          }

          const tags = tagsStr ? tagsStr.split(",").map((t) => t.trim()).filter(Boolean) : [category];

          const item = {
            rowNum,
            title,
            description,
            category,
            tags,
            videoUrl: videoUrl || "https://vjs.zencdn.net/v/oceans.mp4",
            thumbnail: thumbnailRaw || FALLBACK_THUMBNAIL,
            duration: duration || "",
            initialViews: parseInt(initialViews, 10) || 0,
            initialLikes: parseInt(initialLikes, 10) || 0,
            privacy: privacyClean,
            isValid: rowErrors.length === 0,
            errors: rowErrors
          };

          parsed.push(item);
          if (rowErrors.length > 0) {
            errors.push({ rowNum, errors: rowErrors });
          }
        });

        setExcelParsedRows(parsed);
        setExcelValidationErrors(errors);
      } catch (err) {
        showError("Failed to parse Excel file. Please use the sample template.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImportExcelVideos = async () => {
    const validRows = excelParsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      showError("No valid rows found to import.");
      return;
    }

    setIsImportingExcel(true);
    setExcelProgress(0);

    let importedCount = 0;
    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      try {
        const newVideo = {
          title: row.title,
          description: row.description || `Watch ${row.title} on platform.`,
          category: row.category,
          tags: row.tags,
          duration: row.duration || "",
          videoUrl: row.videoUrl,
          thumbnail: row.thumbnail || FALLBACK_THUMBNAIL,
          privacy: row.privacy,
          status: row.privacy === "private" ? "private" : "published",
          initial_views: row.initialViews,
          initial_likes: row.initialLikes,
          views: row.initialViews,
          likes: row.initialLikes,
          author: "Admin",
          uploadedAt: "Just now"
        };

        const saved = await api.createVideo(newVideo);
        if (onAddVideo) onAddVideo(saved || newVideo);

        importedCount++;
        setExcelProgress(Math.round((importedCount / validRows.length) * 100));
      } catch (err) {
        console.warn(`Failed row ${row.rowNum}:`, err);
      }
    }

    setIsImportingExcel(false);
    showSuccess(`Successfully imported ${importedCount} of ${validRows.length} videos from Excel!`);
    setExcelFile(null);
    setExcelParsedRows([]);
    setExcelValidationErrors([]);
    loadStatsAndCategories();
    setTimeout(() => setActiveNav("videos"), 1200);
  };

  // ==========================================
  // EDIT VIDEO HANDLERS
  // ==========================================
  const handleStartEdit = (video) => {
    setEditingVideo({
      ...video,
      title: cleanDisplayTitle(video.title),
      videoUrl: cleanVideoUrl(video.videoUrl || video.title),
      tags: Array.isArray(video.tags) ? video.tags : [],
      privacy: video.privacy || (video.status === "private" ? "private" : "public"),
      initial_views: video.initial_views !== undefined ? video.initial_views : (video.views || 0),
      initial_likes: video.initial_likes !== undefined ? video.initial_likes : (video.likes || 0)
    });
    setEditFile(null);
    setEditThumbnailFile(null);
    setActiveNav("edit");
  };

  const handleEditTagAdd = (val) => {
    const trimmed = (val || "").trim().replace(/^,|,$/g, "");
    if (trimmed && editingVideo && !editingVideo.tags.includes(trimmed)) {
      setEditingVideo({
        ...editingVideo,
        tags: [...editingVideo.tags, trimmed]
      });
    }
  };

  const handleEditTagRemove = (index) => {
    if (editingVideo) {
      setEditingVideo({
        ...editingVideo,
        tags: editingVideo.tags.filter((_, i) => i !== index)
      });
    }
  };

  const handleUpdateVideoSubmit = async (e) => {
    e.preventDefault();
    if (!editingVideo || !editingVideo.title.trim()) {
      showError("Video title is required.");
      return;
    }

    setIsUpdating(true);
    try {
      let finalVideoUrl = editingVideo.videoUrl;
      if (editFile) {
        finalVideoUrl = await api.uploadVideoFile(editFile);
      }

      let finalThumbnail = editingVideo.thumbnail;
      if (editThumbnailFile) {
        finalThumbnail = await api.uploadVideoFile(editThumbnailFile);
      }

      const updatedPayload = {
        ...editingVideo,
        videoUrl: finalVideoUrl,
        thumbnail: finalThumbnail,
        privacy: editingVideo.privacy,
        status: editingVideo.privacy === "private" ? "private" : "published"
      };

      const result = await api.updateVideo(editingVideo.id, updatedPayload);
      if (onUpdateVideo) onUpdateVideo(result || updatedPayload);

      showSuccess(`Video "${editingVideo.title}" updated successfully!`);
      setActiveNav("videos");
      loadVideos();
      loadStatsAndCategories();
    } catch (err) {
      showError(err.message || "Failed to update video.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteVideoConfirm = async (video) => {
    if (window.confirm(`Are you sure you want to delete video "${video.title}"?`)) {
      try {
        await api.deleteVideo(video.id);
        if (onDeleteVideo) onDeleteVideo(video.id);
        showSuccess(`Video "${video.title}" deleted.`);
        if (activeNav === "edit") {
          setActiveNav("videos");
        }
        loadVideos();
        loadStatsAndCategories();
      } catch (err) {
        showError(err.message || "Failed to delete video.");
      }
    }
  };

  // Bulk Delete
  const handleBulkDelete = async () => {
    if (selectedVideoIds.length === 0) return;
    if (window.confirm(`Delete ${selectedVideoIds.length} selected video(s)? This cannot be undone.`)) {
      try {
        await api.bulkDeleteVideos(selectedVideoIds);
        showSuccess(`Successfully deleted ${selectedVideoIds.length} video(s).`);
        setSelectedVideoIds([]);
        loadVideos();
        loadStatsAndCategories();
      } catch (err) {
        showError(err.message || "Failed to delete selected videos.");
      }
    }
  };

  // Bulk Checkbox Toggles
  const handleSelectAllVideos = (e) => {
    if (e.target.checked) {
      setSelectedVideoIds(videosList.map((v) => v.id));
    } else {
      setSelectedVideoIds([]);
    }
  };

  const handleToggleSelectVideo = (id) => {
    if (selectedVideoIds.includes(id)) {
      setSelectedVideoIds(selectedVideoIds.filter((item) => item !== id));
    } else {
      setSelectedVideoIds([...selectedVideoIds, id]);
    }
  };

  // ==========================================
  // CATEGORIES HANDLERS
  // ==========================================
  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    try {
      const created = await api.createCategory(newCatName.trim());
      showSuccess(`Category "${newCatName.trim()}" added!`);
      setNewCatName("");
      loadStatsAndCategories();
    } catch (err) {
      showError(err.message || "Failed to add category.");
    }
  };

  const handleUpdateCategory = async (id) => {
    if (!editingCatName.trim()) return;

    try {
      await api.updateCategory(id, editingCatName.trim());
      showSuccess(`Category updated to "${editingCatName.trim()}"!`);
      setEditingCatId(null);
      setEditingCatName("");
      loadStatsAndCategories();
      loadVideos();
    } catch (err) {
      showError(err.message || "Failed to update category.");
    }
  };

  const handleDeleteCategory = async (cat) => {
    if (
      window.confirm(
        `Are you sure you want to delete category "${cat.name}"? Any assigned videos will safely be moved to "General".`
      )
    ) {
      try {
        await api.deleteCategory(cat.id);
        showSuccess(`Category "${cat.name}" deleted and assigned videos safely moved to "General".`);
        loadStatsAndCategories();
        loadVideos();
      } catch (err) {
        showError(err.message || "Failed to delete category.");
      }
    }
  };

  // Total pages calculation
  const totalPages = Math.max(1, Math.ceil(videosCount / videosLimit));

  return (
    <div className="vap-layout">
      {/* 1. Left Dark Sidebar Menu */}
      <aside className="vap-sidebar">
        <div className="vap-sidebar-brand">
          <div className="vap-brand-icon">
            <Play size={20} fill="#ffffff" />
          </div>
          <span className="vap-brand-title">Video Admin</span>
        </div>

        <nav className="vap-sidebar-nav">
          <button
            className={`vap-nav-item ${activeNav === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveNav("dashboard")}
          >
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </button>

          <button
            className={`vap-nav-item ${activeNav === "videos" || activeNav === "edit" ? "active" : ""}`}
            onClick={() => setActiveNav("videos")}
          >
            <Film size={18} />
            <span>Videos</span>
          </button>

          <button
            className={`vap-nav-item ${activeNav === "upload" ? "active" : ""}`}
            onClick={() => setActiveNav("upload")}
          >
            <UploadCloud size={18} />
            <span>Upload Video</span>
          </button>

          <button
            className={`vap-nav-item ${activeNav === "categories" ? "active" : ""}`}
            onClick={() => setActiveNav("categories")}
          >
            <FolderOpen size={18} />
            <span>Categories</span>
          </button>
        </nav>

        <div className="vap-sidebar-footer">
          <button className="vap-exit-btn" onClick={onExitAdmin} title="Return to public site">
            <ArrowLeft size={16} />
            <span>Back to Website</span>
          </button>
        </div>
      </aside>

      {/* 2. Main Content Area */}
      <main className="vap-main">
        <div className="vap-content-wrapper">
          {/* Notifications */}
          {successMsg && (
            <div className="vap-alert-success">
              <CheckCircle2 size={18} />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="vap-alert-error">
              <AlertCircle size={18} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ========================================================
              SCREEN 1: DASHBOARD
              ======================================================== */}
          {activeNav === "dashboard" && (
            <div>
              <div className="vap-page-header">
                <h2 className="vap-page-title">Dashboard</h2>
              </div>

              {/* Summary Stats Row */}
              <div className="vap-stats-grid">
                <div className="vap-stat-card">
                  <div className="vap-stat-icon blue">
                    <Film size={22} />
                  </div>
                  <div className="vap-stat-meta">
                    <span className="vap-stat-label">Total Videos</span>
                    <span className="vap-stat-value">{stats.totalVideos.toLocaleString()}</span>
                  </div>
                </div>

                <div className="vap-stat-card">
                  <div className="vap-stat-icon green">
                    <Eye size={22} />
                  </div>
                  <div className="vap-stat-meta">
                    <span className="vap-stat-label">Total Views</span>
                    <span className="vap-stat-value">{stats.totalViews.toLocaleString()}</span>
                  </div>
                </div>

                <div className="vap-stat-card">
                  <div className="vap-stat-icon purple">
                    <FolderOpen size={22} />
                  </div>
                  <div className="vap-stat-meta">
                    <span className="vap-stat-label">Total Categories</span>
                    <span className="vap-stat-value">{stats.totalCategories.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Recent Videos Card */}
              <div className="vap-card">
                <div className="vap-card-header">
                  <h3>Recent Videos</h3>
                  <button className="vap-link-btn" onClick={() => setActiveNav("videos")}>
                    View All
                  </button>
                </div>

                <div className="vap-table-container">
                  <table className="vap-table">
                    <thead>
                      <tr>
                        <th>Thumbnail</th>
                        <th>Title</th>
                        <th>Category</th>
                        <th>Views</th>
                        <th>Status</th>
                        <th>Uploaded On</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recentVideos && stats.recentVideos.length > 0 ? (
                        stats.recentVideos.map((vid) => (
                          <tr key={vid.id}>
                            <td>
                              <div className="vap-thumb-cell">
                                <img 
                                  src={vid.thumbnail || FALLBACK_THUMBNAIL} 
                                  alt={cleanDisplayTitle(vid.title)} 
                                  onError={(e) => { e.currentTarget.src = FALLBACK_THUMBNAIL; }}
                                />
                                {vid.duration && <span className="vap-duration-badge">{vid.duration}</span>}
                              </div>
                            </td>
                            <td>
                              <strong className="vap-video-title">{cleanDisplayTitle(vid.title)}</strong>
                            </td>
                            <td>
                              <span className="vap-cat-pill">{vid.category || "General"}</span>
                            </td>
                            <td>{(vid.views || 0).toLocaleString()}</td>
                            <td>
                              {vid.privacy === "private" || vid.status === "private" ? (
                                <span className="vap-badge-private">Private</span>
                              ) : (
                                <span className="vap-badge-public">Public</span>
                              )}
                            </td>
                            <td>{vid.uploadedAt || "Recent"}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} style={{ textAlign: "center", padding: "28px" }}>
                            No videos uploaded yet. Click <strong>Upload Video</strong> to add your first video!
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================
              SCREEN 2: VIDEOS MANAGEMENT
              ======================================================== */}
          {activeNav === "videos" && (
            <div>
              <div className="vap-page-header">
                <h2 className="vap-page-title">Videos</h2>
                <button
                  className="vap-btn-primary"
                  onClick={() => {
                    setActiveNav("upload");
                    setUploadTab("single");
                  }}
                >
                  <Plus size={16} />
                  <span>Upload Video</span>
                </button>
              </div>

              {/* Search & Filters */}
              <form className="vap-filters-bar" onSubmit={handleSearchSubmit}>
                <div className="vap-search-box">
                  <Search size={16} />
                  <input
                    type="text"
                    placeholder="Search videos (title, tags, category...)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <select
                  className="vap-select"
                  value={filterCategory}
                  onChange={(e) => {
                    setFilterCategory(e.target.value);
                    setVideosPage(1);
                  }}
                >
                  <option value="all">All Categories</option>
                  {categoriesList.map((c) => (
                    <option key={c.id || c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <select
                  className="vap-select"
                  value={filterStatus}
                  onChange={(e) => {
                    setFilterStatus(e.target.value);
                    setVideosPage(1);
                  }}
                >
                  <option value="all">All Status</option>
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                </select>

                <button type="submit" className="vap-btn-primary">
                  Search
                </button>
              </form>

              {/* Bulk Actions Bar */}
              {selectedVideoIds.length > 0 && (
                <div className="vap-bulk-bar">
                  <span>
                    <strong>{selectedVideoIds.length}</strong> video(s) selected
                  </span>
                  <div className="vap-bulk-actions">
                    <button className="vap-btn-danger-outline" onClick={handleBulkDelete}>
                      <Trash2 size={15} />
                      <span>Delete Selected</span>
                    </button>
                    <button className="vap-btn-secondary" onClick={() => setSelectedVideoIds([])}>
                      Clear
                    </button>
                  </div>
                </div>
              )}

              {/* Videos Table */}
              <div className="vap-card" style={{ padding: "16px" }}>
                <div className="vap-table-container">
                  <table className="vap-table">
                    <thead>
                      <tr>
                        <th style={{ width: "40px" }}>
                          <input
                            type="checkbox"
                            checked={
                              videosList.length > 0 &&
                              selectedVideoIds.length === videosList.length
                            }
                            onChange={handleSelectAllVideos}
                          />
                        </th>
                        <th>Thumbnail</th>
                        <th>Title</th>
                        <th>Category</th>
                        <th>Duration</th>
                        <th>Views</th>
                        <th>Likes</th>
                        <th>Status</th>
                        <th>Tags</th>
                        <th>Uploaded On</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoadingVideos ? (
                        <tr>
                          <td colSpan={11} style={{ textAlign: "center", padding: "40px" }}>
                            <Loader2 className="animate-spin" size={24} style={{ margin: "0 auto" }} />
                            <span style={{ display: "block", marginTop: "8px" }}>Loading catalog...</span>
                          </td>
                        </tr>
                      ) : videosList.length > 0 ? (
                        videosList.map((vid) => {
                          const isSelected = selectedVideoIds.includes(vid.id);
                          const isPrivate = vid.privacy === "private" || vid.status === "private";
                          return (
                            <tr key={vid.id}>
                              <td>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleSelectVideo(vid.id)}
                                />
                              </td>
                              <td>
                                <div className="vap-thumb-cell">
                                  <img 
                                    src={vid.thumbnail || FALLBACK_THUMBNAIL} 
                                    alt={cleanDisplayTitle(vid.title)} 
                                    onError={(e) => { e.currentTarget.src = FALLBACK_THUMBNAIL; }}
                                  />
                                  {vid.duration && <span className="vap-duration-badge">{vid.duration}</span>}
                                </div>
                              </td>
                              <td>
                                <strong 
                                  className="vap-video-title"
                                  style={{ cursor: "pointer" }}
                                  title="Open live on website"
                                  onClick={() => {
                                    if (onViewVideo) onViewVideo(vid);
                                    else window.open(`/?v=${vid.id}`, "_blank");
                                  }}
                                >
                                  {cleanDisplayTitle(vid.title)}
                                </strong>
                              </td>
                              <td>
                                <span className="vap-cat-pill">{vid.category || "General"}</span>
                              </td>
                              <td>{vid.duration || "-"}</td>
                              <td>{(vid.views || 0).toLocaleString()}</td>
                              <td>{(vid.likes || 0).toLocaleString()}</td>
                              <td>
                                {isPrivate ? (
                                  <span className="vap-badge-private">Private</span>
                                ) : (
                                  <span className="vap-badge-public">Public</span>
                                )}
                              </td>
                              <td>
                                {Array.isArray(vid.tags) && vid.tags.slice(0, 3).map((tag, idx) => (
                                  <span key={idx} className="vap-tag-pill">
                                    {tag}
                                  </span>
                                ))}
                              </td>
                              <td>{vid.uploadedAt || "Recent"}</td>
                              <td>
                                <div className="vap-actions-cell">
                                  <button
                                    className="vap-icon-btn"
                                    onClick={() => {
                                      if (onViewVideo) onViewVideo(vid);
                                      else window.open(`/?v=${vid.id}`, "_blank");
                                    }}
                                    title="View Live on Website"
                                  >
                                    <ExternalLink size={15} />
                                  </button>
                                  <button
                                    className="vap-icon-btn"
                                    onClick={() => setPreviewVideo(vid)}
                                    title="Play Preview (In Admin)"
                                  >
                                    <Eye size={15} />
                                  </button>
                                  <button
                                    className="vap-icon-btn"
                                    onClick={() => handleStartEdit(vid)}
                                    title="Edit Video"
                                  >
                                    <Pencil size={15} />
                                  </button>
                                  <button
                                    className="vap-icon-btn danger"
                                    onClick={() => handleDeleteVideoConfirm(vid)}
                                    title="Delete Video"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={11} style={{ textAlign: "center", padding: "36px" }}>
                            No videos matched your filter criteria.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="vap-pagination">
                  <span>
                    Showing {videosList.length > 0 ? (videosPage - 1) * videosLimit + 1 : 0} -{" "}
                    {Math.min(videosPage * videosLimit, videosCount)} of {videosCount} videos
                  </span>

                  <div className="vap-page-buttons">
                    <button
                      className="vap-page-btn"
                      disabled={videosPage <= 1}
                      onClick={() => setVideosPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft size={16} />
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => (
                      <button
                        key={num}
                        className={`vap-page-btn ${num === videosPage ? "active" : ""}`}
                        onClick={() => setVideosPage(num)}
                      >
                        {num}
                      </button>
                    ))}

                    <button
                      className="vap-page-btn"
                      disabled={videosPage >= totalPages}
                      onClick={() => setVideosPage((p) => Math.min(totalPages, p + 1))}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================
              SCREEN 3: UPLOAD VIDEO (4 Tabs)
              ======================================================== */}
          {activeNav === "upload" && (
            <div>
              {/* Four Tabs in exact required order */}
              <div className="vap-upload-tabs">
                <button
                  type="button"
                  className={`vap-upload-tab ${uploadTab === "single" ? "active" : ""}`}
                  onClick={() => setUploadTab("single")}
                >
                  <UploadCloud size={17} />
                  <span>Single Upload</span>
                </button>

                <button
                  type="button"
                  className={`vap-upload-tab ${uploadTab === "bulk" ? "active" : ""}`}
                  onClick={() => setUploadTab("bulk")}
                >
                  <Layers size={17} />
                  <span>Bulk Upload</span>
                </button>

                <button
                  type="button"
                  className={`vap-upload-tab ${uploadTab === "link" ? "active" : ""}`}
                  onClick={() => setUploadTab("link")}
                >
                  <LinkIcon size={17} />
                  <span>Upload via Link</span>
                </button>

                <button
                  type="button"
                  className={`vap-upload-tab ${uploadTab === "excel" ? "active" : ""}`}
                  onClick={() => setUploadTab("excel")}
                >
                  <FileSpreadsheet size={17} />
                  <span>Upload from Excel</span>
                </button>
              </div>

              {/* TAB 1: SINGLE UPLOAD */}
              {uploadTab === "single" && (
                <div className="vap-card">
                  <form onSubmit={handleSingleUploadSubmit}>
                    <div className="vap-two-col-layout">
                      {/* Left Column: Video file / Video Link & Thumbnail */}
                      <div>
                        {/* Source Type Toggle */}
                        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                          <button
                            type="button"
                            className={`vap-btn-${singleSourceType === "file" ? "primary" : "secondary"}`}
                            style={{ flex: 1, justifyContent: "center", fontSize: "0.83rem", padding: "8px 10px" }}
                            onClick={() => setSingleSourceType("file")}
                          >
                            <UploadCloud size={16} />
                            <span>Upload File (Server Storage)</span>
                          </button>
                          <button
                            type="button"
                            className={`vap-btn-${singleSourceType === "link" ? "primary" : "secondary"}`}
                            style={{ flex: 1, justifyContent: "center", fontSize: "0.83rem", padding: "8px 10px" }}
                            onClick={() => setSingleSourceType("link")}
                          >
                            <LinkIcon size={16} />
                            <span>Direct Video Link (No Duplicate)</span>
                          </button>
                        </div>

                        {singleSourceType === "file" ? (
                          <div className="vap-form-group">
                            <label>Video File (from local device) <span className="required">*</span></label>
                            <input
                              type="file"
                              ref={singleVideoInputRef}
                              accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm,video/*"
                              style={{ display: "none" }}
                              onChange={(e) => handleSingleFileSelect(e.target.files?.[0])}
                            />

                            <div
                              className="vap-dropzone"
                              onClick={() => singleVideoInputRef.current?.click()}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                e.preventDefault();
                                if (e.dataTransfer.files?.[0]) {
                                  handleSingleFileSelect(e.dataTransfer.files[0]);
                                }
                              }}
                            >
                              <div className="vap-dropzone-icon">
                                <UploadCloud size={28} />
                              </div>
                              <div className="vap-dropzone-prompt">
                                {singleFile ? singleFile.name : "Drag & drop video file here"}
                              </div>
                              <span className="vap-dropzone-sub">or</span>
                              <button
                                type="button"
                                className="vap-btn-primary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  singleVideoInputRef.current?.click();
                                }}
                              >
                                Choose File
                              </button>
                              <span className="vap-dropzone-sub" style={{ marginTop: "6px" }}>
                                Supported formats: MP4, MOV, AVI, MKV, WEBM (Max: 2 GB)
                              </span>
                              {singleFile && (
                                <span style={{ color: "#16a34a", fontSize: "0.85rem", fontWeight: 600 }}>
                                  ✓ Selected: {(singleFile.size / (1024 * 1024)).toFixed(1)} MB {singleDuration ? `| Duration: ${singleDuration}` : ""}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="vap-form-group">
                            <label>Direct Video URL (CDN / MP4 / Stream / YouTube) <span className="required">*</span></label>
                            <input
                              type="url"
                              className="vap-input"
                              placeholder="https://cdn.example.com/video.mp4 or YouTube link"
                              value={singleVideoUrl}
                              onChange={(e) => handleSingleVideoUrlChange(e.target.value)}
                            />
                            <span style={{ fontSize: "0.8rem", color: "#2563eb", marginTop: "5px", display: "block" }}>
                              ⚡ Video will stream directly via this link. No duplicate file will be uploaded to your server storage.
                            </span>
                            {singleDuration && (
                              <span style={{ color: "#16a34a", fontSize: "0.82rem", fontWeight: 600, display: "block", marginTop: "4px" }}>
                                ✓ Auto-detected video duration: {singleDuration}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Thumbnail picker & Link */}
                        <div className="vap-form-group">
                          <label>Thumbnail (Auto-detected, Upload File, or Image URL)</label>
                          <input
                            type="file"
                            ref={singleThumbInputRef}
                            accept="image/jpeg,image/png,image/webp"
                            style={{ display: "none" }}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setSingleThumbnailFile(file);
                                setSingleThumbnail(URL.createObjectURL(file));
                              }
                            }}
                          />

                          <div style={{ display: "flex", gap: "14px", alignItems: "flex-start", flexWrap: "wrap" }}>
                            <div
                              style={{
                                width: "130px",
                                height: "76px",
                                borderRadius: "8px",
                                background: "#f1f5f9",
                                border: "1px solid #cbd5e1",
                                overflow: "hidden",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0
                              }}
                            >
                              {(singleThumbnailUrl || singleThumbnail) ? (
                                <img
                                  src={singleThumbnailUrl || singleThumbnail}
                                  alt="Thumbnail preview"
                                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                />
                              ) : (
                                <Film size={24} color="#94a3b8" />
                              )}
                            </div>

                            <div style={{ flex: 1, minWidth: "200px", display: "flex", flexDirection: "column", gap: "8px" }}>
                              <div style={{ display: "flex", gap: "8px" }}>
                                <button
                                  type="button"
                                  className="vap-btn-secondary"
                                  style={{ fontSize: "0.82rem", padding: "6px 12px" }}
                                  onClick={() => singleThumbInputRef.current?.click()}
                                >
                                  Choose File
                                </button>
                                {(singleThumbnail || singleThumbnailUrl || singleThumbnailFile) && (
                                  <button
                                    type="button"
                                    className="vap-btn-secondary"
                                    style={{ fontSize: "0.82rem", color: "#dc2626", padding: "6px 10px" }}
                                    onClick={() => {
                                      setSingleThumbnail("");
                                      setSingleThumbnailFile(null);
                                      setSingleThumbnailUrl("");
                                    }}
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>
                              <input
                                type="url"
                                className="vap-input"
                                style={{ fontSize: "0.85rem", padding: "6px 10px" }}
                                placeholder="Or enter custom Thumbnail URL"
                                value={singleThumbnailUrl}
                                onChange={(e) => setSingleThumbnailUrl(e.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right Column: Title, Description, Category, Tags, Privacy */}
                      <div>
                        <div className="vap-form-group">
                          <label>Title <span className="required">*</span></label>
                          <input
                            type="text"
                            className="vap-input"
                            placeholder="Enter video title"
                            value={singleTitle}
                            onChange={(e) => setSingleTitle(e.target.value)}
                            required
                          />
                        </div>

                        <div className="vap-form-group">
                          <label>Description</label>
                          <textarea
                            className="vap-textarea"
                            placeholder="Write a short description..."
                            value={singleDescription}
                            onChange={(e) => setSingleDescription(e.target.value)}
                          />
                        </div>

                        <div className="vap-form-group">
                          <label>Category <span className="required">*</span></label>
                          <select
                            className="vap-form-select"
                            value={singleCategory}
                            onChange={(e) => setSingleCategory(e.target.value)}
                          >
                            {categoriesList.map((c) => (
                              <option key={c.id || c.name} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="vap-form-group">
                          <label>Tags (press Enter to add)</label>
                          <div className="vap-tags-wrap">
                            {singleTags.map((tag, idx) => (
                              <span key={idx} className="vap-tag-item">
                                {tag}
                                <button
                                  type="button"
                                  className="vap-tag-remove"
                                  onClick={() => handleRemoveSingleTag(idx)}
                                >
                                  <X size={12} />
                                </button>
                              </span>
                            ))}
                            <input
                              type="text"
                              className="vap-tag-input"
                              placeholder="Add tag and press Enter"
                              value={singleTagInput}
                              onChange={(e) => setSingleTagInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === ",") {
                                  e.preventDefault();
                                  handleAddSingleTag();
                                }
                              }}
                            />
                          </div>
                        </div>

                        {/* Duration & Engagement */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                          <div className="vap-form-group">
                            <label>Duration (MM:SS)</label>
                            <input
                              type="text"
                              className="vap-input"
                              value={singleDuration}
                              onChange={(e) => setSingleDuration(e.target.value)}
                              placeholder="Auto or MM:SS"
                            />
                          </div>
                          <div className="vap-form-group">
                            <label>Initial Views</label>
                            <input
                              type="number"
                              className="vap-input"
                              placeholder="0"
                              value={singleInitialViews}
                              onChange={(e) => setSingleInitialViews(e.target.value)}
                            />
                          </div>
                          <div className="vap-form-group">
                            <label>Initial Likes</label>
                            <input
                              type="number"
                              className="vap-input"
                              placeholder="0"
                              value={singleInitialLikes}
                              onChange={(e) => setSingleInitialLikes(e.target.value)}
                            />
                          </div>
                        </div>

                        {/* Privacy Selection */}
                        <div className="vap-form-group">
                          <label>Privacy <span className="required">*</span></label>
                          <select
                            className="vap-form-select"
                            value={singlePrivacy}
                            onChange={(e) => setSinglePrivacy(e.target.value)}
                          >
                            <option value="public">Public (Visible to all permitted website visitors)</option>
                            <option value="private">Private (Only visible to authorized admin)</option>
                          </select>
                        </div>

                        <div style={{ marginTop: "24px" }}>
                          <button
                            type="submit"
                            className="vap-btn-primary"
                            style={{ width: "100%", justifyContent: "center", padding: "12px" }}
                            disabled={isUploadingSingle}
                          >
                            {isUploadingSingle ? (
                              <>
                                <Loader2 className="animate-spin" size={18} />
                                <span>Uploading & Processing Video...</span>
                              </>
                            ) : (
                              <span>Upload Video</span>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </form>
                </div>
              )}

              {/* TAB 2: BULK UPLOAD */}
              {uploadTab === "bulk" && (
                <div className="vap-card">
                  <div className="vap-form-group">
                    <label>Select Multiple Local Video Files</label>
                    <input
                      type="file"
                      ref={bulkVideoInputRef}
                      multiple
                      accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm,video/*"
                      style={{ display: "none" }}
                      onChange={(e) => handleBulkFilesSelect(e.target.files)}
                    />

                    <div
                      className="vap-dropzone"
                      onClick={() => bulkVideoInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (e.dataTransfer.files) {
                          handleBulkFilesSelect(e.dataTransfer.files);
                        }
                      }}
                    >
                      <div className="vap-dropzone-icon">
                        <Layers size={28} />
                      </div>
                      <div className="vap-dropzone-prompt">Drag & drop multiple videos here</div>
                      <span className="vap-dropzone-sub">or</span>
                      <button
                        type="button"
                        className="vap-btn-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          bulkVideoInputRef.current?.click();
                        }}
                      >
                        Choose Multiple Files
                      </button>
                    </div>
                  </div>

                  {bulkFiles.length > 0 && (
                    <div style={{ marginTop: "24px" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: "16px",
                          flexWrap: "wrap",
                          gap: "12px"
                        }}
                      >
                        <h4>Selected Videos ({bulkFiles.length})</h4>
                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                          <select
                            className="vap-select"
                            value={bulkDefaultCategory}
                            onChange={(e) => {
                              const cat = e.target.value;
                              setBulkDefaultCategory(cat);
                              setBulkFiles((prev) => prev.map((f) => ({ ...f, category: cat })));
                            }}
                          >
                            {categoriesList.map((c) => (
                              <option key={c.id || c.name} value={c.name}>
                                Apply Category: {c.name}
                              </option>
                            ))}
                          </select>

                          <select
                            className="vap-select"
                            value={bulkDefaultPrivacy}
                            onChange={(e) => {
                              const priv = e.target.value;
                              setBulkDefaultPrivacy(priv);
                              setBulkFiles((prev) => prev.map((f) => ({ ...f, privacy: priv })));
                            }}
                          >
                            <option value="public">Apply Privacy: Public</option>
                            <option value="private">Apply Privacy: Private</option>
                          </select>

                          <button
                            type="button"
                            className="vap-btn-secondary"
                            onClick={() => setBulkFiles([])}
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      {/* Bulk Progress Bar */}
                      {isUploadingBulk && (
                        <div style={{ marginBottom: "16px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "4px" }}>
                            <span>Overall Progress</span>
                            <span>{bulkOverallProgress}%</span>
                          </div>
                          <div style={{ width: "100%", height: "8px", background: "#e2e8f0", borderRadius: "4px", overflow: "hidden" }}>
                            <div style={{ width: `${bulkOverallProgress}%`, height: "100%", background: "#2563eb", transition: "width 0.3s" }} />
                          </div>
                        </div>
                      )}

                      {/* Items table */}
                      <div className="vap-table-container">
                        <table className="vap-table">
                          <thead>
                            <tr>
                              <th>Thumbnail</th>
                              <th>Title</th>
                              <th>Category</th>
                              <th>Duration</th>
                              <th>Privacy</th>
                              <th>Status</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bulkFiles.map((item, idx) => (
                              <tr key={item.id}>
                                <td>
                                  <div className="vap-thumb-cell">
                                    {item.thumbnail ? (
                                      <img src={item.thumbnail} alt={item.title} />
                                    ) : (
                                      <Film size={20} color="#94a3b8" />
                                    )}
                                  </div>
                                </td>
                                <td>
                                  <input
                                    type="text"
                                    className="vap-input"
                                    value={item.title}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setBulkFiles((prev) =>
                                        prev.map((it) => (it.id === item.id ? { ...it, title: val } : it))
                                      );
                                    }}
                                  />
                                </td>
                                <td>
                                  <select
                                    className="vap-select"
                                    value={item.category}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setBulkFiles((prev) =>
                                        prev.map((it) => (it.id === item.id ? { ...it, category: val } : it))
                                      );
                                    }}
                                  >
                                    {categoriesList.map((c) => (
                                      <option key={c.id || c.name} value={c.name}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td>{item.duration}</td>
                                <td>
                                  <select
                                    className="vap-select"
                                    value={item.privacy}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setBulkFiles((prev) =>
                                        prev.map((it) => (it.id === item.id ? { ...it, privacy: val } : it))
                                      );
                                    }}
                                  >
                                    <option value="public">Public</option>
                                    <option value="private">Private</option>
                                  </select>
                                </td>
                                <td>
                                  {item.status === "pending" && (
                                    <span style={{ color: "#64748b", fontSize: "0.85rem" }}>Pending</span>
                                  )}
                                  {item.status === "uploading" && (
                                    <span style={{ color: "#2563eb", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "4px" }}>
                                      <Loader2 className="animate-spin" size={14} /> {item.progress}%
                                    </span>
                                  )}
                                  {item.status === "success" && (
                                    <span style={{ color: "#16a34a", fontSize: "0.85rem", fontWeight: 600 }}>✓ Done</span>
                                  )}
                                  {item.status === "error" && (
                                    <span style={{ color: "#dc2626", fontSize: "0.85rem" }}>{item.error || "Failed"}</span>
                                  )}
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className="vap-icon-btn danger"
                                    onClick={() => setBulkFiles(bulkFiles.filter((_, i) => i !== idx))}
                                  >
                                    <X size={14} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className="vap-btn-primary"
                          disabled={isUploadingBulk || bulkFiles.length === 0}
                          onClick={handleBulkUploadAll}
                        >
                          {isUploadingBulk ? "Uploading all videos..." : `Upload All (${bulkFiles.length}) Videos`}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: UPLOAD VIA LINK */}
              {uploadTab === "link" && (
                <div className="vap-card">
                  <form onSubmit={handleLinkImportSubmit}>
                    <div className="vap-two-col-layout">
                      <div>
                        <div className="vap-form-group">
                          <label>Video URL (YouTube, Vimeo, CDN, Direct MP4) <span className="required">*</span></label>
                          <input
                            type="url"
                            className="vap-input"
                            placeholder="https://www.youtube.com/watch?v=... or direct MP4 URL"
                            value={linkUrl}
                            onChange={(e) => handleLinkUrlChange(e.target.value)}
                            required
                          />
                          <span style={{ fontSize: "0.8rem", color: "#2563eb", marginTop: "4px" }}>
                            💡 YouTube URLs automatically extract high-resolution thumbnail and video embed!
                          </span>
                        </div>

                        <div className="vap-form-group">
                          <label>Thumbnail URL (auto-fetched or custom)</label>
                          <input
                            type="text"
                            className="vap-input"
                            placeholder="Thumbnail image URL"
                            value={linkThumbnail}
                            onChange={(e) => setLinkThumbnail(e.target.value)}
                          />

                          {linkThumbnail && (
                            <div
                              style={{
                                width: "100%",
                                maxHeight: "180px",
                                borderRadius: "8px",
                                overflow: "hidden",
                                marginTop: "8px",
                                border: "1px solid #cbd5e1"
                              }}
                            >
                              <img
                                src={linkThumbnail}
                                alt="Preview"
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="vap-form-group">
                          <label>Title <span className="required">*</span></label>
                          <input
                            type="text"
                            className="vap-input"
                            placeholder="Enter video title"
                            value={linkTitle}
                            onChange={(e) => setLinkTitle(e.target.value)}
                            required
                          />
                        </div>

                        <div className="vap-form-group">
                          <label>Description</label>
                          <textarea
                            className="vap-textarea"
                            placeholder="Write video overview..."
                            value={linkDescription}
                            onChange={(e) => setLinkDescription(e.target.value)}
                          />
                        </div>

                        <div className="vap-form-group">
                          <label>Category <span className="required">*</span></label>
                          <select
                            className="vap-form-select"
                            value={linkCategory}
                            onChange={(e) => setLinkCategory(e.target.value)}
                          >
                            {categoriesList.map((c) => (
                              <option key={c.id || c.name} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="vap-form-group">
                          <label>Tags (press Enter to add)</label>
                          <div className="vap-tags-wrap">
                            {linkTags.map((tag, idx) => (
                              <span key={idx} className="vap-tag-item">
                                {tag}
                                <button
                                  type="button"
                                  className="vap-tag-remove"
                                  onClick={() => setLinkTags(linkTags.filter((_, i) => i !== idx))}
                                >
                                  <X size={12} />
                                </button>
                              </span>
                            ))}
                            <input
                              type="text"
                              className="vap-tag-input"
                              placeholder="Add tag and press Enter"
                              value={linkTagInput}
                              onChange={(e) => setLinkTagInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === ",") {
                                  e.preventDefault();
                                  handleAddLinkTag();
                                }
                              }}
                            />
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                          <div className="vap-form-group">
                            <label>Duration</label>
                            <input
                              type="text"
                              className="vap-input"
                              placeholder="Auto or MM:SS"
                              value={linkDuration}
                              onChange={(e) => setLinkDuration(e.target.value)}
                            />
                          </div>
                          <div className="vap-form-group">
                            <label>Initial Views</label>
                            <input
                              type="number"
                              className="vap-input"
                              placeholder="0"
                              value={linkInitialViews}
                              onChange={(e) => setLinkInitialViews(e.target.value)}
                            />
                          </div>
                          <div className="vap-form-group">
                            <label>Initial Likes</label>
                            <input
                              type="number"
                              className="vap-input"
                              placeholder="0"
                              value={linkInitialLikes}
                              onChange={(e) => setLinkInitialLikes(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="vap-form-group">
                          <label>Privacy <span className="required">*</span></label>
                          <select
                            className="vap-form-select"
                            value={linkPrivacy}
                            onChange={(e) => setLinkPrivacy(e.target.value)}
                          >
                            <option value="public">Public</option>
                            <option value="private">Private</option>
                          </select>
                        </div>

                        <div style={{ marginTop: "20px" }}>
                          <button
                            type="submit"
                            className="vap-btn-primary"
                            style={{ width: "100%", justifyContent: "center", padding: "12px" }}
                            disabled={isImportingLink}
                          >
                            {isImportingLink ? "Importing Video..." : "Import Video via Link"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </form>
                </div>
              )}

              {/* TAB 4: UPLOAD FROM EXCEL */}
              {uploadTab === "excel" && (
                <div className="vap-card">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "20px",
                      flexWrap: "wrap",
                      gap: "12px"
                    }}
                  >
                    <div>
                      <h4 style={{ margin: 0, fontSize: "1.1rem" }}>Bulk Metadata Import via Excel</h4>
                      <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "0.85rem" }}>
                        Upload video entries from .xlsx, .xls, or .csv files with complete column validation.
                      </p>
                    </div>

                    <button
                      type="button"
                      className="vap-btn-secondary"
                      onClick={handleDownloadExcelTemplate}
                    >
                      <Download size={16} />
                      <span>Download Sample Excel Template</span>
                    </button>
                  </div>

                  <input
                    type="file"
                    ref={excelInputRef}
                    accept=".xlsx,.xls,.csv"
                    style={{ display: "none" }}
                    onChange={(e) => handleExcelFileSelect(e.target.files?.[0])}
                  />

                  <div
                    className="vap-dropzone"
                    onClick={() => excelInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files?.[0]) {
                        handleExcelFileSelect(e.dataTransfer.files[0]);
                      }
                    }}
                  >
                    <div className="vap-dropzone-icon">
                      <FileSpreadsheet size={28} />
                    </div>
                    <div className="vap-dropzone-prompt">
                      {excelFile ? excelFile.name : "Drag & drop your Excel file (.xlsx / .csv)"}
                    </div>
                    <span className="vap-dropzone-sub">or</span>
                    <button
                      type="button"
                      className="vap-btn-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        excelInputRef.current?.click();
                      }}
                    >
                      Choose Excel File
                    </button>
                  </div>

                  {/* Excel parsed rows and row-level validation */}
                  {excelParsedRows.length > 0 && (
                    <div style={{ marginTop: "24px" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: "12px",
                          flexWrap: "wrap",
                          gap: "10px"
                        }}
                      >
                        <div>
                          <strong>{excelParsedRows.length} Rows Parsed: </strong>
                          <span style={{ color: "#16a34a", fontWeight: 600, marginLeft: "6px" }}>
                            {excelParsedRows.filter((r) => r.isValid).length} Valid
                          </span>
                          {excelValidationErrors.length > 0 && (
                            <span style={{ color: "#dc2626", fontWeight: 600, marginLeft: "12px" }}>
                              {excelValidationErrors.length} Errors Found
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          className="vap-btn-primary"
                          disabled={isImportingExcel || excelParsedRows.filter((r) => r.isValid).length === 0}
                          onClick={handleImportExcelVideos}
                        >
                          {isImportingExcel
                            ? `Importing... (${excelProgress}%)`
                            : `Import ${excelParsedRows.filter((r) => r.isValid).length} Valid Videos`}
                        </button>
                      </div>

                      {/* Row-level errors & details table */}
                      <div className="vap-table-container">
                        <table className="vap-excel-validation-table">
                          <thead>
                            <tr>
                              <th>Row</th>
                              <th>Status</th>
                              <th>Title</th>
                              <th>Category</th>
                              <th>Privacy</th>
                              <th>Duration</th>
                              <th>Validation Details</th>
                            </tr>
                          </thead>
                          <tbody>
                            {excelParsedRows.map((r) => (
                              <tr key={r.rowNum} style={{ background: r.isValid ? "#ffffff" : "#fef2f2" }}>
                                <td>#{r.rowNum}</td>
                                <td>
                                  {r.isValid ? (
                                    <span style={{ color: "#16a34a", fontWeight: 600 }}>✓ Valid</span>
                                  ) : (
                                    <span style={{ color: "#dc2626", fontWeight: 600 }}>⚠ Error</span>
                                  )}
                                </td>
                                <td><strong>{r.title || "(Missing Title)"}</strong></td>
                                <td>{r.category}</td>
                                <td>{r.privacy}</td>
                                <td>{r.duration}</td>
                                <td>
                                  {r.isValid ? (
                                    <span style={{ color: "#16a34a" }}>Ready for import</span>
                                  ) : (
                                    <span style={{ color: "#dc2626" }}>{r.errors.join(", ")}</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ========================================================
              SCREEN 4: EDIT VIDEO
              ======================================================== */}
          {activeNav === "edit" && editingVideo && (
            <div>
              <div className="vap-page-header">
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <button className="vap-btn-secondary" onClick={() => setActiveNav("videos")}>
                    <ArrowLeft size={16} />
                    <span>Back to Videos</span>
                  </button>
                  <h2 className="vap-page-title">Edit Video</h2>
                </div>
              </div>

              <div className="vap-card">
                <form onSubmit={handleUpdateVideoSubmit}>
                  <div className="vap-two-col-layout">
                    {/* Left Column: Player preview, Replace file, Thumbnail, Delete button */}
                    <div>
                      {/* Playable Video Preview */}
                      <div className="vap-form-group">
                        <label>Current Video Preview</label>
                        <div
                          style={{
                            width: "100%",
                            aspectRatio: "16 / 9",
                            background: "#000",
                            borderRadius: "8px",
                            overflow: "hidden"
                          }}
                        >
                          {editingVideo.videoUrl && editingVideo.videoUrl.includes("youtube.com") ? (
                            <iframe
                              src={editingVideo.videoUrl.replace("watch?v=", "embed/")}
                              title={editingVideo.title}
                              style={{ width: "100%", height: "100%", border: "none" }}
                              allowFullScreen
                            />
                          ) : (
                            <video
                              src={editingVideo.videoUrl}
                              poster={editingVideo.thumbnail}
                              controls
                              style={{ width: "100%", height: "100%", objectFit: "contain" }}
                            />
                          )}
                        </div>
                      </div>

                      {/* Optional replacement video file */}
                      <div className="vap-form-group">
                        <label>Change Video File (optional)</label>
                        <input
                          type="file"
                          ref={editVideoInputRef}
                          accept="video/*"
                          style={{ display: "none" }}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setEditFile(file);
                              const meta = await detectVideoMeta(file);
                              setEditingVideo({
                                ...editingVideo,
                                duration: meta.duration || editingVideo.duration
                              });
                            }
                          }}
                        />

                        <div
                          className="vap-dropzone"
                          style={{ minHeight: "130px", padding: "18px" }}
                          onClick={() => editVideoInputRef.current?.click()}
                        >
                          <UploadCloud size={24} color="#2563eb" />
                          <span className="vap-dropzone-prompt">
                            {editFile ? editFile.name : "Drag & drop new video file here"}
                          </span>
                          <button
                            type="button"
                            className="vap-btn-primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              editVideoInputRef.current?.click();
                            }}
                          >
                            Choose File
                          </button>
                        </div>
                      </div>

                      {/* Thumbnail with change button */}
                      <div className="vap-form-group">
                        <label>Thumbnail</label>
                        <input
                          type="file"
                          ref={editThumbInputRef}
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setEditThumbnailFile(file);
                              setEditingVideo({
                                ...editingVideo,
                                thumbnail: URL.createObjectURL(file)
                              });
                            }
                          }}
                        />

                        <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
                          <div
                            style={{
                              width: "120px",
                              height: "70px",
                              borderRadius: "8px",
                              overflow: "hidden",
                              border: "1px solid #cbd5e1"
                            }}
                          >
                            <img
                              src={editingVideo.thumbnail || FALLBACK_THUMBNAIL}
                              alt="Thumbnail"
                              onError={(e) => { e.currentTarget.src = FALLBACK_THUMBNAIL; }}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          </div>

                          <button
                            type="button"
                            className="vap-btn-secondary"
                            onClick={() => editThumbInputRef.current?.click()}
                          >
                            Change Thumbnail
                          </button>
                        </div>
                      </div>

                      {/* Live Website URL Box */}
                      <div style={{ marginTop: "18px", padding: "12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                        <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", marginBottom: "4px" }}>
                          Live Website URL
                        </div>
                        <a 
                          href={`/?v=${editingVideo.id}`} 
                          target="_blank" 
                          rel="noreferrer" 
                          style={{ fontSize: "0.85rem", color: "#2563eb", textDecoration: "none", wordBreak: "break-all", display: "inline-flex", alignItems: "center", gap: "5px" }}
                          title="Open video live on website"
                        >
                          <ExternalLink size={13} />
                          <span>{window.location.origin}/?v={editingVideo.id}</span>
                        </a>
                      </div>

                      {/* Delete Video Button (red outline at bottom left) */}
                      <div style={{ marginTop: "24px" }}>
                        <button
                          type="button"
                          className="vap-btn-danger-outline"
                          onClick={() => handleDeleteVideoConfirm(editingVideo)}
                        >
                          <Trash2 size={16} />
                          <span>Delete Video</span>
                        </button>
                      </div>
                    </div>

                    {/* Right Column: Title, Description, Category, Tags, Duration, Privacy, Initial values */}
                    <div>
                      <div className="vap-form-group">
                        <label>Title <span className="required">*</span></label>
                        <input
                          type="text"
                          className="vap-input"
                          value={editingVideo.title}
                          onChange={(e) => setEditingVideo({ ...editingVideo, title: e.target.value })}
                          required
                        />
                      </div>

                      <div className="vap-form-group">
                        <label>Description</label>
                        <textarea
                          className="vap-textarea"
                          value={editingVideo.description || ""}
                          onChange={(e) => setEditingVideo({ ...editingVideo, description: e.target.value })}
                        />
                      </div>

                      <div className="vap-form-group">
                        <label>Category <span className="required">*</span></label>
                        <select
                          className="vap-form-select"
                          value={editingVideo.category || "General"}
                          onChange={(e) => setEditingVideo({ ...editingVideo, category: e.target.value })}
                        >
                          {categoriesList.map((c) => (
                            <option key={c.id || c.name} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Tags */}
                      <div className="vap-form-group">
                        <label>Tags</label>
                        <div className="vap-tags-wrap">
                          {editingVideo.tags.map((tag, idx) => (
                            <span key={idx} className="vap-tag-item">
                              {tag}
                              <button
                                type="button"
                                className="vap-tag-remove"
                                onClick={() => handleEditTagRemove(idx)}
                              >
                                <X size={12} />
                              </button>
                            </span>
                          ))}
                          <input
                            type="text"
                            className="vap-tag-input"
                            placeholder="Add tag and press Enter"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === ",") {
                                e.preventDefault();
                                handleEditTagAdd(e.target.value);
                                e.target.value = "";
                              }
                            }}
                          />
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                        <div className="vap-form-group">
                          <label>Duration</label>
                          <input
                            type="text"
                            className="vap-input"
                            value={editingVideo.duration || ""}
                            placeholder="Auto or MM:SS"
                            onChange={(e) => setEditingVideo({ ...editingVideo, duration: e.target.value })}
                          />
                        </div>

                        <div className="vap-form-group">
                          <label>Initial Views</label>
                          <input
                            type="number"
                            className="vap-input"
                            value={editingVideo.initial_views !== undefined ? editingVideo.initial_views : 0}
                            onChange={(e) =>
                              setEditingVideo({ ...editingVideo, initial_views: parseInt(e.target.value, 10) || 0 })
                            }
                          />
                        </div>

                        <div className="vap-form-group">
                          <label>Initial Likes</label>
                          <input
                            type="number"
                            className="vap-input"
                            value={editingVideo.initial_likes !== undefined ? editingVideo.initial_likes : 0}
                            onChange={(e) =>
                              setEditingVideo({ ...editingVideo, initial_likes: parseInt(e.target.value, 10) || 0 })
                            }
                          />
                        </div>
                      </div>

                      <div style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "16px" }}>
                        Actual platform engagement: <strong>{(editingVideo.views || 0).toLocaleString()} views</strong>,{" "}
                        <strong>{(editingVideo.likes || 0).toLocaleString()} likes</strong> (preserved safely during updates).
                      </div>

                      {/* Privacy Radio / Dropdown */}
                      <div className="vap-form-group">
                        <label>Privacy <span className="required">*</span></label>
                        <div className="vap-privacy-card">
                          <label className="vap-privacy-opt">
                            <input
                              type="radio"
                              name="editPrivacy"
                              value="public"
                              checked={editingVideo.privacy !== "private"}
                              onChange={() => setEditingVideo({ ...editingVideo, privacy: "public" })}
                            />
                            <div className="vap-privacy-text">
                              <strong>Public</strong>
                              <span>Visible to all permitted website visitors</span>
                            </div>
                          </label>

                          <label className="vap-privacy-opt">
                            <input
                              type="radio"
                              name="editPrivacy"
                              value="private"
                              checked={editingVideo.privacy === "private"}
                              onChange={() => setEditingVideo({ ...editingVideo, privacy: "private" })}
                            />
                            <div className="vap-privacy-text">
                              <strong>Private</strong>
                              <span>Only visible to authorized administrator</span>
                            </div>
                          </label>
                        </div>
                      </div>

                      <div style={{ marginTop: "24px", display: "flex", justifyContent: "flex-end" }}>
                        <button type="submit" className="vap-btn-primary" disabled={isUpdating}>
                          {isUpdating ? "Saving changes..." : "Update Video"}
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ========================================================
              SCREEN 5: CATEGORIES
              ======================================================== */}
          {activeNav === "categories" && (
            <div>
              <div className="vap-page-header">
                <h2 className="vap-page-title">Categories</h2>
              </div>

              {/* Add Category Form */}
              <div className="vap-card" style={{ marginBottom: "20px" }}>
                <form onSubmit={handleAddCategory} style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
                  <div className="vap-form-group" style={{ flex: 1, margin: 0 }}>
                    <label>New Category Name</label>
                    <input
                      type="text"
                      className="vap-input"
                      placeholder="e.g. Comedy, Podcast, Travel"
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                    />
                  </div>
                  <button type="submit" className="vap-btn-primary">
                    <Plus size={16} />
                    <span>Add Category</span>
                  </button>
                </form>
              </div>

              {/* Categories List */}
              <div className="vap-card">
                <div className="vap-table-container">
                  <table className="vap-table">
                    <thead>
                      <tr>
                        <th>Category Name</th>
                        <th>Slug</th>
                        <th>Videos Count</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoriesList.map((cat) => (
                        <tr key={cat.id || cat.name}>
                          <td>
                            {editingCatId === cat.id ? (
                              <input
                                type="text"
                                className="vap-input"
                                value={editingCatName}
                                onChange={(e) => setEditingCatName(e.target.value)}
                                autoFocus
                              />
                            ) : (
                              <strong>{cat.name}</strong>
                            )}
                          </td>
                          <td>
                            <span style={{ color: "#64748b" }}>{cat.slug || cat.name.toLowerCase()}</span>
                          </td>
                          <td>
                            <span className="vap-cat-pill">{cat.count || 0} videos</span>
                          </td>
                          <td>
                            <div className="vap-actions-cell">
                              {editingCatId === cat.id ? (
                                <>
                                  <button
                                    className="vap-icon-btn"
                                    onClick={() => handleUpdateCategory(cat.id)}
                                    title="Save category"
                                  >
                                    <Check size={15} color="#16a34a" />
                                  </button>
                                  <button
                                    className="vap-icon-btn"
                                    onClick={() => setEditingCatId(null)}
                                    title="Cancel"
                                  >
                                    <X size={15} />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    className="vap-icon-btn"
                                    onClick={() => {
                                      setEditingCatId(cat.id);
                                      setEditingCatName(cat.name);
                                    }}
                                    title="Edit category"
                                  >
                                    <Pencil size={15} />
                                  </button>
                                  <button
                                    className="vap-icon-btn danger"
                                    onClick={() => handleDeleteCategory(cat)}
                                    title="Delete category"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ========================================================
          VIDEO PLAY & PREVIEW MODAL
          ======================================================== */}
      {previewVideo && (
        <div className="vap-modal-backdrop" onClick={() => setPreviewVideo(null)}>
          <div className="vap-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="vap-modal-header">
              <h3>{cleanDisplayTitle(previewVideo.title)}</h3>
              <button className="vap-icon-btn" onClick={() => setPreviewVideo(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="vap-modal-body">
              <div className="vap-modal-video">
                {previewVideo.videoUrl && previewVideo.videoUrl.includes("youtube.com") ? (
                  <iframe
                    src={cleanVideoUrl(previewVideo.videoUrl).replace("watch?v=", "embed/")}
                    title={cleanDisplayTitle(previewVideo.title)}
                    style={{ width: "100%", height: "100%", border: "none" }}
                    allowFullScreen
                  />
                ) : (
                  <video
                    src={cleanVideoUrl(previewVideo.videoUrl)}
                    poster={previewVideo.thumbnail || FALLBACK_THUMBNAIL}
                    controls
                    autoPlay
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                )}
              </div>

              <div style={{ marginTop: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span className="vap-cat-pill" style={{ marginRight: "8px" }}>
                    {previewVideo.category || "General"}
                  </span>
                  <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
                    {previewVideo.views || 0} views{previewVideo.duration ? ` • ${previewVideo.duration}` : ""}
                  </span>
                </div>

                <div>
                  {previewVideo.privacy === "private" || previewVideo.status === "private" ? (
                    <span className="vap-badge-private">Private</span>
                  ) : (
                    <span className="vap-badge-public">Public</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
