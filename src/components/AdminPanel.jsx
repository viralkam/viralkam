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
  ExternalLink,
  History,
  Tag,
  Server,
  Zap,
  RefreshCw,
  Camera,
  Calendar,
  Clock,
  HardDrive,
  Copy
} from "lucide-react";
import { api } from "../services/api";
import { uploadHistory } from "../services/uploadHistory";
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

  // Live Tags from Database
  const [tagsList, setTagsList] = useState([]);
  const [newTagName, setNewTagName] = useState("");
  const [editingTagId, setEditingTagId] = useState(null);
  const [editingTagName, setEditingTagName] = useState("");

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

  // Excel Export State (Date-based and Full data export)
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportDateMode, setExportDateMode] = useState("all"); // "all" | "upto" | "range" | "today" | "last7" | "last30"
  const [exportEndDate, setExportEndDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  });
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportCategoryFilter, setExportCategoryFilter] = useState("all");
  const [exportPrivacyFilter, setExportPrivacyFilter] = useState("all");
  const [allExportVideos, setAllExportVideos] = useState([]);
  const [isLoadingAllVideos, setIsLoadingAllVideos] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportIncludeStorage, setExportIncludeStorage] = useState(true);
  const [exportIncludeLinks, setExportIncludeLinks] = useState(true);

  // Edit Video State
  const [editingVideo, setEditingVideo] = useState(null);
  const [editFile, setEditFile] = useState(null);
  const [editThumbnailFile, setEditThumbnailFile] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Upload Video Tab: 1=single, 2=bulk, 3=link, 4=excel
  const [uploadTab, setUploadTab] = useState("single");

  // Single Upload Form State (supports both local file upload & direct CDN link)
  const [singleSourceType, setSingleSourceType] = useState("file"); // "file" | "link" | "excel"
  const [saveToServer, setSaveToServer] = useState(() => {
    try {
      const stored = localStorage.getItem("vk_save_to_server");
      return stored !== null ? stored === "true" : true;
    } catch {
      return true;
    }
  });

  const handleToggleSaveToServer = (val) => {
    const nextVal = val !== undefined ? val : !saveToServer;
    setSaveToServer(nextVal);
    try {
      localStorage.setItem("vk_save_to_server", String(nextVal));
    } catch {}
  };

  // Video scrubber and frame capture states
  const [videoDurationSecs, setVideoDurationSecs] = useState(0);
  const [currentScrubTime, setCurrentScrubTime] = useState(0);
  const videoPlayerRef = useRef(null);

  // Excel Import Modal State
  const [showImportExcelModal, setShowImportExcelModal] = useState(false);
  const [lastSkippedRows, setLastSkippedRows] = useState([]);
  const [excelImportStep, setExcelImportStep] = useState("");
  const [isFetchingMeta, setIsFetchingMeta] = useState(false);
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
  const [singleDuration, setSingleDuration] = useState("00:00");
  const [singleInitialViews, setSingleInitialViews] = useState("0");
  const [singleInitialLikes, setSingleInitialLikes] = useState("0");
  const [singleUploadDate, setSingleUploadDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [singleUploadTime, setSingleUploadTime] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  });
  const [editUploadDate, setEditUploadDate] = useState("");
  const [editUploadTime, setEditUploadTime] = useState("");
  const [singlePrivacy, setSinglePrivacy] = useState("public");
  const [isUploadingSingle, setIsUploadingSingle] = useState(false);
  const [singleUploadProgress, setSingleUploadProgress] = useState(0);
  const [singleUploadStep, setSingleUploadStep] = useState("");
  const [singleUploadSuccessVideo, setSingleUploadSuccessVideo] = useState(null);
  const [singleUploadError, setSingleUploadError] = useState("");

  // Persistent Upload History State
  const [historyList, setHistoryList] = useState(() => uploadHistory.getAll());
  const [historyFilter, setHistoryFilter] = useState("all");

  const refreshHistory = () => {
    setHistoryList(uploadHistory.getAll());
  };

  useEffect(() => {
    const handleStorageChange = () => refreshHistory();
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

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
  const editVideoPlayerRef = useRef(null);
  const [editVideoDurationSecs, setEditVideoDurationSecs] = useState(0);
  const [editCurrentScrubTime, setEditCurrentScrubTime] = useState(0);
  const [isEditFetchingMeta, setIsEditFetchingMeta] = useState(false);

  // Other PS (Other Person Storage) State
  const [otherPsFilter, setOtherPsFilter] = useState("all");
  const [selectedOtherPsIds, setSelectedOtherPsIds] = useState([]);
  const [isSyncingStorage, setIsSyncingStorage] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStepText, setSyncStepText] = useState("");
  const [isSwitchingSource, setIsSwitchingSource] = useState(false);
  const [otherPsSearch, setOtherPsSearch] = useState("");
  const [otherPsStartDate, setOtherPsStartDate] = useState("");
  const [otherPsEndDate, setOtherPsEndDate] = useState("");

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

    try {
      const tags = await api.getTags();
      if (tags && tags.length > 0) {
        setTagsList(tags);
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

  const loadAllVideosForExport = async () => {
    setIsLoadingAllVideos(true);
    try {
      const fullList = await api.getAllVideosForExport();
      if (fullList && fullList.length > 0) {
        setAllExportVideos(fullList);
      } else {
        setAllExportVideos(videosList.length > 0 ? videosList : initialVideos);
      }
    } catch (err) {
      console.warn("[Export] Falling back to local videos:", err);
      setAllExportVideos(videosList.length > 0 ? videosList : initialVideos);
    } finally {
      setIsLoadingAllVideos(false);
    }
  };

  useEffect(() => {
    if (activeNav === "export" || activeNav === "other_ps") {
      loadAllVideosForExport();
    }
  }, [activeNav]);

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

  const formatSecsToTime = (totalSec) => {
    const sec = Math.floor(totalSec) || 0;
    if (sec <= 0) return "00:00";
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const remSec = sec % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(remSec).padStart(2, "0")}`;
    }
    return `${String(mins).padStart(2, "0")}:${String(remSec).padStart(2, "0")}`;
  };

  // Instant duplicate check (<1ms) against published videos
  const checkDuplicateVideo = (targetUrl) => {
    if (!targetUrl || typeof targetUrl !== "string") return null;
    const cleanTarget = cleanVideoUrl(targetUrl).trim();
    if (!cleanTarget || cleanTarget === "https://vjs.zencdn.net/v/oceans.mp4") return null;

    const ytMatch = cleanTarget.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
    const ytId = ytMatch ? ytMatch[1] : null;

    const listToSearch = allExportVideos.length > 0 ? allExportVideos : (videosList.length > 0 ? videosList : initialVideos);

    for (const item of listToSearch) {
      if (!item || !item.videoUrl) continue;
      const itemUrl = cleanVideoUrl(item.videoUrl).trim();
      if (itemUrl.toLowerCase() === cleanTarget.toLowerCase()) {
        return item;
      }
      if (item.other_ps_url && cleanVideoUrl(item.other_ps_url).toLowerCase() === cleanTarget.toLowerCase()) {
        return item;
      }
      if (item.our_server_url && cleanVideoUrl(item.our_server_url).toLowerCase() === cleanTarget.toLowerCase()) {
        return item;
      }
      if (ytId && (itemUrl.includes(ytId) || (item.other_ps_url && item.other_ps_url.includes(ytId)))) {
        return item;
      }
      try {
        const u1 = new URL(cleanTarget).pathname;
        const u2 = new URL(itemUrl).pathname;
        if (u1 && u2 && u1 === u2 && u1 !== "/" && !u1.endsWith("oceans.mp4")) {
          return item;
        }
      } catch {}
    }
    return null;
  };

  // Storage source classification helpers
  const isVideoOnOurServer = (video) => {
    if (!video) return false;
    if (video.storage_source === "our_server") return true;
    if (video.our_server_url && video.our_server_url.trim().length > 0) return true;
    const url = (video.videoUrl || video.url || "").toLowerCase();
    if (
      url.includes("/cdn/") ||
      url.includes("/uploads/") ||
      url.includes("vcdn.viralkaam.com") ||
      url.includes(".r2.dev") ||
      url.includes("workers.dev/cdn")
    ) {
      return true;
    }
    return false;
  };

  const isOtherPsVideo = (video) => {
    if (!video) return false;
    if (video.storage_source === "other_ps") return true;
    if (video.other_ps_url && video.other_ps_url.trim().length > 0) return true;
    return !isVideoOnOurServer(video);
  };

  const isOtherPsSynced = (video) => {
    if (!video) return false;
    if (video.our_server_url && video.our_server_url.trim().length > 0) return true;
    if (video.storage_source === "our_server" && isVideoOnOurServer(video)) return true;
    return false;
  };

  const getAllCurrentVideos = () => {
    return allExportVideos.length > 0 ? allExportVideos : (videosList.length > 0 ? videosList : initialVideos);
  };

  const getOtherPsVideos = () => {
    const list = getAllCurrentVideos();
    return list.filter(isOtherPsVideo);
  };

  const getFilteredOtherPsVideos = () => {
    let list = getOtherPsVideos();

    if (otherPsSearch && otherPsSearch.trim()) {
      const q = otherPsSearch.trim().toLowerCase();
      list = list.filter((v) =>
        (v.title && v.title.toLowerCase().includes(q)) ||
        (v.category && v.category.toLowerCase().includes(q)) ||
        (v.videoUrl && v.videoUrl.toLowerCase().includes(q))
      );
    }

    if (otherPsStartDate) {
      list = list.filter((v) => {
        const d = getVideoDate(v);
        if (!d) return true;
        const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        return dStr >= otherPsStartDate;
      });
    }

    if (otherPsEndDate) {
      list = list.filter((v) => {
        const d = getVideoDate(v);
        if (!d) return true;
        const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        return dStr <= otherPsEndDate;
      });
    }

    if (otherPsFilter === "pending") {
      return list.filter((v) => !isOtherPsSynced(v));
    }
    if (otherPsFilter === "synced") {
      return list.filter((v) => isOtherPsSynced(v));
    }
    if (otherPsFilter === "active_our_server") {
      return list.filter((v) => isOtherPsSynced(v) && (v.active_source || "our_server") === "our_server");
    }
    if (otherPsFilter === "active_other_ps") {
      return list.filter((v) => v.active_source === "other_ps" || !isOtherPsSynced(v));
    }

    return list;
  };

  // Sync external Other PS video(s) to Cloudflare R2
  const handleSyncOtherPsVideos = async (targetIds = null) => {
    const idsToSync = Array.isArray(targetIds)
      ? targetIds
      : (targetIds ? [targetIds] : selectedOtherPsIds);

    if (!idsToSync || idsToSync.length === 0) {
      showError("Kripya kam se kam 1 video select karein sync karne ke liye.");
      return;
    }

    const confirmMsg = idsToSync.length === 1
      ? "Kya aap is video ko Hamare Server Storage (Cloudflare R2) me save/sync karna chahte hain?\n\nHamara server URL primary ban jayega aur original friend link secondary backup rahega."
      : `Kya aap ${idsToSync.length} videos ko Hamare Server Storage (Cloudflare R2) me sync karna chahte hain?\n\nSabhi videos hamare server par stream hongi aur external links secondary backup ban jayenge.`;

    if (!window.confirm(confirmMsg)) return;

    setIsSyncingStorage(true);
    setSyncProgress(10);
    setSyncStepText(`Connecting to Cloudflare R2 sync service for ${idsToSync.length} video(s)...`);

    try {
      setSyncProgress(35);
      setSyncStepText(`Downloading video stream and saving into Cloudflare R2 bucket...`);

      const res = await api.syncStorageVideos(idsToSync);
      setSyncProgress(85);
      setSyncStepText(`Updating primary & secondary backup URLs in database...`);

      if (res && res.success) {
        setSyncProgress(100);
        showSuccess(res.message || `✓ Successfully synced ${idsToSync.length} video(s) to Server Storage!`);
        setSelectedOtherPsIds([]);
        await loadVideos();
        await loadAllVideosForExport();
      } else {
        showError(res?.message || "Sync me koi issue aaya.");
      }
    } catch (err) {
      console.error("[Sync Error]:", err);
      showError(err.message || "Server storage par sync fail ho gaya.");
    } finally {
      setIsSyncingStorage(false);
      setSyncProgress(0);
      setSyncStepText("");
    }
  };

  // 1-Click active stream source switcher
  const handleSwitchOtherPsSource = async (targetIds, targetSource, switchAll = false) => {
    const isOurServer = targetSource === "our_server";
    const label = isOurServer ? "Our Server Storage (Cloudflare R2)" : "Other Person Storage (Friend Server)";

    let ids = [];
    if (!switchAll) {
      ids = Array.isArray(targetIds)
        ? targetIds
        : (targetIds ? [targetIds] : selectedOtherPsIds);
      if (ids.length === 0) {
        showError("Kripya source change karne ke liye video select karein.");
        return;
      }
    }

    const confirmMsg = switchAll
      ? `Kya aap sabhi eligible videos ko ${label} se stream karna chahte hain?`
      : `Kya aap ${ids.length} videos ko ${label} se stream karne ke liye switch karna chahte hain?`;

    if (!window.confirm(confirmMsg)) return;

    setIsSwitchingSource(true);
    try {
      const res = await api.switchVideoSource({
        ids: switchAll ? [] : ids,
        source: targetSource,
        all: switchAll
      });

      if (res && res.success) {
        showSuccess(res.message || `✓ Playback source switched to ${label}!`);
        setSelectedOtherPsIds([]);
        await loadVideos();
        await loadAllVideosForExport();
      } else {
        showError(res?.message || "Source switch karne me error aaya.");
      }
    } catch (err) {
      console.error("[Switch Source Error]:", err);
      showError(err.message || "Source switch fail ho gaya.");
    } finally {
      setIsSwitchingSource(false);
    }
  };

  // Quick selection helpers
  const handleSelectCount = (count) => {
    const list = getFilteredOtherPsVideos();
    const slice = list.slice(0, count);
    setSelectedOtherPsIds(slice.map((v) => v.id));
  };

  const handleSelectAllPending = () => {
    const list = getOtherPsVideos();
    const pending = list.filter((v) => !isOtherPsSynced(v));
    setSelectedOtherPsIds(pending.map((v) => v.id));
  };

  const handleSelectByDateRange = () => {
    const list = getFilteredOtherPsVideos();
    setSelectedOtherPsIds(list.map((v) => v.id));
    showSuccess(`${list.length} videos selected matching date range.`);
  };

  // Capture video frame at current scrub time as thumbnail
  const handleCaptureCurrentVideoFrame = () => {
    const vid = videoPlayerRef.current;
    if (!vid) {
      showError("Video player is not ready yet.");
      return;
    }
    try {
      const canvas = document.createElement("canvas");
      canvas.width = vid.videoWidth || 640;
      canvas.height = vid.videoHeight || 360;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
      setSingleThumbnail(dataUrl);
      setSingleThumbnailUrl(dataUrl);
      setLinkThumbnail(dataUrl);
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `thumb-${Math.floor(vid.currentTime)}s.jpg`, { type: "image/jpeg" });
          setSingleThumbnailFile(file);
        }
      }, "image/jpeg", 0.88);
      showSuccess(`✓ Frame captured at ${formatSecsToTime(vid.currentTime)} as thumbnail!`);
    } catch (err) {
      console.warn("Capture frame error:", err);
      showError("Could not capture frame: " + err.message);
    }
  };

  // Export Skipped / Duplicate rows as Excel sheet
  const handleExportSkippedExcel = (customList) => {
    const rows = (customList || lastSkippedRows || []).map((r, i) => ({
      "Row": r.rowNum || (i + 1),
      "Video URL": r.videoUrl || "",
      "Title": r.title || "",
      "Status": r.isDuplicate ? "Already Published (Skipped)" : "Validation Error",
      "Existing Video Match": r.duplicateTitle || r.duplicateOf || "Found in Database",
      "Category": r.category || "",
      "Tags": Array.isArray(r.tags) ? r.tags.join(", ") : (r.tags || "")
    }));
    if (rows.length === 0) {
      showError("No skipped rows to export.");
      return;
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Skipped_Videos");
    XLSX.writeFile(wb, `skipped_unpublished_videos_${Date.now()}.xlsx`);
    showSuccess(`✓ Downloaded ${rows.length} skipped videos to Excel!`);
  };

  // ==========================================
  // SINGLE UPLOAD HANDLERS
  // ==========================================
  const handleSingleFileSelect = async (file) => {
    if (!file) return;
    setSingleFile(file);
    // Clear link when file is chosen
    setSingleVideoUrl("");
    setLinkUrl("");

    // Auto-fill title if empty
    if (!singleTitle) {
      const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
      setSingleTitle(cleanName);
      setLinkTitle(cleanName);
    }

    // Auto-detect duration and thumbnail frame
    const meta = await detectVideoMeta(file);
    if (meta.duration) {
      setSingleDuration(meta.duration);
      setLinkDuration(meta.duration);
    }
    if (meta.thumbnail && !singleThumbnail && !singleThumbnailUrl) {
      setSingleThumbnail(meta.thumbnail);
      setSingleThumbnailUrl(meta.thumbnail);
    }
  };

  const handleSingleVideoUrlChange = (val) => {
    let clean = (val || "").trim();
    const iframeMatch = clean.match(/src=["']([^"']+)["']/i);
    if (iframeMatch && iframeMatch[1]) {
      clean = iframeMatch[1];
    }
    setSingleVideoUrl(clean);
    setLinkUrl(clean);

    if (clean) {
      // Clear local file when video link is entered
      setSingleFile(null);
      if (singleVideoInputRef.current) singleVideoInputRef.current.value = "";
    }

    // Auto extract YouTube ID and thumbnail
    const ytMatch = clean.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
    if (ytMatch && ytMatch[1]) {
      const ytId = ytMatch[1];
      const ytThumb = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
      setSingleThumbnail(ytThumb);
      setSingleThumbnailUrl(ytThumb);
      setLinkThumbnail(ytThumb);
    }

    // Auto suggest clean title from URL if title is empty
    if (!singleTitle && clean) {
      const suggested = cleanDisplayTitle(clean);
      if (suggested && suggested !== "Untitled Video") {
        setSingleTitle(suggested);
        setLinkTitle(suggested);
      }
    }

    // Auto detect duration and thumbnail frame from direct video link
    if (clean && (clean.startsWith("http://") || clean.startsWith("https://"))) {
      detectVideoMeta(clean).then((meta) => {
        if (meta.duration) {
          setSingleDuration(meta.duration);
          setLinkDuration(meta.duration);
        }
        if (meta.thumbnail && !singleThumbnail && !singleThumbnailUrl) {
          setSingleThumbnail(meta.thumbnail);
          setSingleThumbnailUrl(meta.thumbnail);
        }
      });
    }
  };

  const handleAutoFetchMetadata = async (urlToFetch) => {
    let target = (urlToFetch !== undefined ? urlToFetch : (singleVideoUrl || linkUrl)).trim();
    if (!target) {
      showError("Please enter a video URL first.");
      return;
    }
    // Clean iframe src if pasted (e.g. from embed code)
    const iframeMatch = target.match(/src=["']([^"']+)["']/i);
    if (iframeMatch && iframeMatch[1]) {
      target = iframeMatch[1].trim();
    }
    setSingleVideoUrl(target);
    setLinkUrl(target);
    setSingleFile(null);
    if (singleVideoInputRef.current) singleVideoInputRef.current.value = "";

    setIsFetchingMeta(true);
    try {
      const data = await api.fetchMetadata(target);
      if (data && data.success) {
        if (data.title) {
          setSingleTitle(data.title);
          setLinkTitle(data.title);
        }
        if (data.description) {
          setSingleDescription(data.description);
          setLinkDescription(data.description);
        }
        if (data.thumbnail) {
          setSingleThumbnail(data.thumbnail);
          setSingleThumbnailUrl(data.thumbnail);
          setLinkThumbnail(data.thumbnail);
        }
        if (data.duration) {
          setSingleDuration(data.duration);
          setLinkDuration(data.duration);
        }
        if (data.category) {
          const match = categoriesList.find(c => c.name.toLowerCase() === data.category.toLowerCase());
          const catToSet = match ? match.name : data.category;
          setSingleCategory(catToSet);
          setLinkCategory(catToSet);
        }
        if (data.tags && Array.isArray(data.tags) && data.tags.length > 0) {
          const combined = Array.from(new Set([...singleTags, ...data.tags]));
          setSingleTags(combined);
          setLinkTags(combined);
        } else if (singleTags.length === 0) {
          const fallbackTags = ["Viral", "Trending", "HD"];
          setSingleTags(fallbackTags);
          setLinkTags(fallbackTags);
        }
        setSingleInitialViews("0");
        setLinkInitialViews("0");
        setSingleInitialLikes("0");
        setLinkInitialLikes("0");

        showSuccess("✓ Video title, thumbnail, duration, category & tags auto-fetched!");
      } else {
        const suggested = cleanDisplayTitle(target);
        if (suggested) {
          setSingleTitle(suggested);
          setLinkTitle(suggested);
        }
        detectVideoMeta(target).then((meta) => {
          if (meta.duration) {
            setSingleDuration(meta.duration);
            setLinkDuration(meta.duration);
          }
          if (meta.thumbnail && !singleThumbnail && !singleThumbnailUrl) {
            setSingleThumbnail(meta.thumbnail);
            setSingleThumbnailUrl(meta.thumbnail);
            setLinkThumbnail(meta.thumbnail);
          }
        });
        setSingleInitialViews("0");
        setLinkInitialViews("0");
        setSingleInitialLikes("0");
        setLinkInitialLikes("0");
        if (singleTags.length === 0) {
          setSingleTags(["Viral", "Trending", "HD"]);
          setLinkTags(["Viral", "Trending", "HD"]);
        }
        showSuccess("✓ Video link recognized. Basic details auto-filled.");
      }
    } catch (err) {
      console.warn("Auto-fetch error:", err);
      const ytMatch = target.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
      if (ytMatch && ytMatch[1]) {
        const ytId = ytMatch[1];
        const ytThumb = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
        setSingleThumbnail(ytThumb);
        setSingleThumbnailUrl(ytThumb);
        setLinkThumbnail(ytThumb);
        if (!singleTitle) {
          setSingleTitle(`YouTube Video (${ytId})`);
          setLinkTitle(`YouTube Video (${ytId})`);
        }
      } else {
        const suggested = cleanDisplayTitle(target);
        if (suggested && !singleTitle) {
          setSingleTitle(suggested);
          setLinkTitle(suggested);
        }
      }
      setSingleInitialViews("0");
      setLinkInitialViews("0");
      setSingleInitialLikes("0");
      setLinkInitialLikes("0");
      if (singleTags.length === 0) {
        setSingleTags(["Viral", "Trending"]);
      }
      showSuccess("✓ Video link recognized and defaults filled.");
    } finally {
      setIsFetchingMeta(false);
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
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    setSingleUploadSuccessVideo(null);
    setSingleUploadError("");

    const currentUrl = (singleVideoUrl || linkUrl || "").trim();
    const isLocalUpload = Boolean(singleFile);

    if (!isLocalUpload && !currentUrl) {
      showError("Please enter a Video Link or select a Local Video File.");
      return;
    }

    // Auto-detect title from link or file name if not typed
    let finalTitle = (singleTitle || linkTitle || "").trim();
    if (!finalTitle) {
      if (isLocalUpload && singleFile) {
        finalTitle = singleFile.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
      } else if (currentUrl) {
        finalTitle = cleanDisplayTitle(currentUrl) || "Stream Video";
      }
      if (finalTitle) {
        setSingleTitle(finalTitle);
        setLinkTitle(finalTitle);
      }
    }

    if (!finalTitle) {
      showError("Please enter a video title.");
      return;
    }

    // Instant duplicate link check
    if (!isLocalUpload && currentUrl) {
      const dup = checkDuplicateVideo(currentUrl);
      if (dup) {
        if (saveToServer) {
          const proceed = window.confirm(
            `⚡ Notice: This video is already in database as "${dup.title}".\n\n` +
            `Since "Save in Server Storage" is ON, this video will be synced to Our Server Storage (Cloudflare R2) as Primary URL, keeping the original link as Backup.\n\n` +
            `Proceed to Sync?`
          );
          if (!proceed) return;

          setIsUploadingSingle(true);
          setSingleUploadStep("Syncing existing video to Our Server Storage (Cloudflare R2)...");
          try {
            const syncRes = await api.syncStorageVideos([dup.id]);
            if (syncRes && syncRes.success) {
              showSuccess(`✓ Video "${dup.title}" synced to Server Storage! Primary URL updated.`);
              await loadVideos();
              await loadAllVideosForExport();
              setSingleVideoUrl("");
              setLinkUrl("");
              return;
            } else {
              showError(syncRes?.message || "Failed to sync to server storage.");
              return;
            }
          } catch (err) {
            showError(err.message || "Failed to sync to server storage.");
            return;
          } finally {
            setIsUploadingSingle(false);
            setSingleUploadStep("");
          }
        } else {
          const proceed = window.confirm(
            `⚠️ Notice: This video is already published as "${dup.title}".\n\nDo you still want to publish it again?`
          );
          if (!proceed) return;
        }
      }
    }

    // Duration fallback
    let finalDuration = (singleDuration || "").trim();
    if (!finalDuration || finalDuration === "00:00") {
      if (videoDurationSecs) {
        finalDuration = formatSecsToTime(videoDurationSecs);
      } else {
        finalDuration = "00:00";
      }
    }

    const initialViewsNum = parseInt(singleInitialViews, 10) || 0;
    const initialLikesNum = parseInt(singleInitialLikes, 10) || 0;

    const historyId = `up-${Date.now()}`;
    const uploadMethod = isLocalUpload ? "Single Upload (File)" : "Upload via Link";
    const fileNameDesc = isLocalUpload ? singleFile.name : currentUrl;
    const sizeStr = isLocalUpload ? `${(singleFile.size / (1024 * 1024)).toFixed(2)} MB` : (saveToServer ? "Save to Server" : "Direct Link");

    uploadHistory.addItem({
      id: historyId,
      title: finalTitle,
      type: uploadMethod,
      fileName: fileNameDesc,
      fileSize: sizeStr,
      duration: finalDuration,
      thumbnail: singleThumbnailUrl.trim() || singleThumbnail || linkThumbnail || FALLBACK_THUMBNAIL,
      status: "uploading",
      progress: 10,
      currentStep: isLocalUpload ? "Uploading video to Server storage..." : (saveToServer ? "Downloading & saving video to server storage..." : "Saving video link to database...")
    });
    refreshHistory();

    setIsUploadingSingle(true);
    setSingleUploadProgress(0);
    setSingleUploadStep(isLocalUpload ? "Starting upload to server storage..." : (saveToServer ? "Streaming video to server storage..." : "Saving video details..."));

    try {
      let finalVideoUrl = "";
      if (isLocalUpload) {
        finalVideoUrl = await api.uploadVideoFile(singleFile, (pct, loaded, total) => {
          const loadedMB = (loaded / (1024 * 1024)).toFixed(1);
          const totalMB = (total / (1024 * 1024)).toFixed(1);
          setSingleUploadProgress(pct);
          setSingleUploadStep(`Uploading to server storage (${loadedMB} MB / ${totalMB} MB)...`);
          uploadHistory.updateItem(historyId, {
            progress: pct,
            currentStep: `Uploading: ${pct}% (${loadedMB}/${totalMB} MB)`
          });
          refreshHistory();
        });
      } else {
        finalVideoUrl = cleanVideoUrl(currentUrl);
      }

      setSingleUploadProgress(88);
      setSingleUploadStep("Processing thumbnail...");
      let finalThumbnailUrl = singleThumbnailUrl.trim() || singleThumbnail || linkThumbnail;
      if (singleThumbnailFile) {
        finalThumbnailUrl = await api.uploadVideoFile(singleThumbnailFile);
      }

      if (!finalThumbnailUrl) {
        finalThumbnailUrl = FALLBACK_THUMBNAIL;
      }

      const initialViewsNum = parseInt(singleInitialViews, 10) || 0;
      const initialLikesNum = parseInt(singleInitialLikes, 10) || 0;

      // Compute formatted created_at & uploadedAt from date/time inputs
      let formattedCreatedAt = "";
      let formattedUploadedAt = "Just now";
      try {
        const dStr = singleUploadDate || new Date().toISOString().substring(0, 10);
        const tStr = singleUploadTime ? (singleUploadTime.length === 5 ? `${singleUploadTime}:00` : singleUploadTime) : new Date().toTimeString().substring(0, 8);
        const [yr, mo, da] = dStr.split("-");
        const dt = new Date(`${yr}-${mo}-${da}T${tStr}`);
        if (!isNaN(dt.getTime())) {
          formattedCreatedAt = `${yr}-${mo}-${da} ${tStr}`;
          formattedUploadedAt = `${da}/${mo}/${yr}`;
        }
      } catch {}

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
        uploadedAt: formattedUploadedAt,
        created_at: formattedCreatedAt || undefined,
        saveToServer: saveToServer
      };

      setSingleUploadProgress(95);
      setSingleUploadStep("Registering video & publishing to database...");
      uploadHistory.updateItem(historyId, {
        progress: 95,
        currentStep: "Saving to database..."
      });
      refreshHistory();

      const saved = await api.createVideo(newVideo);
      if (onAddVideo) onAddVideo(saved || newVideo);

      setSingleUploadProgress(100);
      setSingleUploadStep("✓ Published Successfully!");
      setSingleUploadSuccessVideo(saved || newVideo);

      uploadHistory.updateItem(historyId, {
        status: "published",
        progress: 100,
        currentStep: "Published Live",
        videoUrl: finalVideoUrl,
        videoId: saved?.id || "",
        thumbnail: finalThumbnailUrl
      });
      refreshHistory();

      showSuccess(`Video "${singleTitle}" uploaded and published successfully!`);

      // Reset single upload form fields
      setSingleFile(null);
      setSingleVideoUrl("");
      setSingleTitle("");
      setSingleDescription("");
      setSingleTags([]);
      setSingleThumbnail("");
      setSingleThumbnailFile(null);
      setSingleThumbnailUrl("");
      setSingleInitialViews("0");
      setSingleInitialLikes("0");
      setSingleDuration("00:00");
      setSinglePrivacy("public");

      // Reload stats & videos
      loadStatsAndCategories();
      loadVideos();
    } catch (err) {
      const errMsg = err.message || "Failed to upload video.";
      setSingleUploadError(errMsg);
      setSingleUploadStep(`Failed: ${errMsg}`);
      uploadHistory.updateItem(historyId, {
        status: "failed",
        error: errMsg,
        currentStep: "Upload / Publish Failed"
      });
      refreshHistory();
      showError(errMsg);
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

      const histId = `bulk-${item.id}`;
      uploadHistory.addItem({
        id: histId,
        title: item.title,
        type: "Bulk Upload",
        fileName: item.file.name,
        fileSize: `${(item.file.size / (1024 * 1024)).toFixed(2)} MB`,
        duration: item.duration,
        thumbnail: item.thumbnail || FALLBACK_THUMBNAIL,
        status: "uploading",
        progress: 15,
        currentStep: "Uploading file to server storage..."
      });
      refreshHistory();

      // Mark current item uploading
      setBulkFiles((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: "uploading", progress: 20 } : it))
      );

      try {
        const fileUrl = await api.uploadVideoFile(item.file, (pct) => {
          const scaled = Math.min(85, Math.round(pct * 0.85));
          setBulkFiles((prev) =>
            prev.map((it) => (it.id === item.id ? { ...it, progress: scaled } : it))
          );
          uploadHistory.updateItem(histId, { progress: scaled, currentStep: `Uploaded ${pct}%` });
        });

        setBulkFiles((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, progress: 90 } : it))
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
          uploadedAt: "Just now",
          saveToServer: saveToServer
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

        uploadHistory.updateItem(histId, {
          status: "published",
          progress: 100,
          currentStep: "Published Live",
          videoUrl: fileUrl,
          videoId: saved?.id || ""
        });
        refreshHistory();
      } catch (err) {
        setBulkFiles((prev) =>
          prev.map((it) =>
            it.id === item.id ? { ...it, status: "error", error: err.message || "Upload failed" } : it
          )
        );

        uploadHistory.updateItem(histId, {
          status: "failed",
          error: err.message || "Bulk upload failed",
          currentStep: "Failed"
        });
        refreshHistory();
      }
    }

    setIsUploadingBulk(false);
    showSuccess(`Bulk upload finished! ${completedCount} of ${total} videos processed.`);
    loadStatsAndCategories();
    loadVideos();
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
    if (e && typeof e.preventDefault === "function") e.preventDefault();
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

    const histId = `link-${Date.now()}`;
    uploadHistory.addItem({
      id: histId,
      title: finalCleanTitle,
      type: "Upload via Link",
      fileName: finalCleanUrl,
      fileSize: "Direct Link",
      duration: linkDuration.trim(),
      thumbnail: linkThumbnail.trim() || FALLBACK_THUMBNAIL,
      status: "uploading",
      progress: 50,
      currentStep: "Saving details to database..."
    });
    refreshHistory();

    setIsImportingLink(true);
    try {
      const initialViewsNum = parseInt(linkInitialViews, 10) || 0;
      const initialLikesNum = parseInt(linkInitialLikes, 10) || 0;

      let formattedCreatedAt = "";
      let formattedUploadedAt = "Just now";
      try {
        const dStr = singleUploadDate || new Date().toISOString().substring(0, 10);
        const tStr = singleUploadTime ? (singleUploadTime.length === 5 ? `${singleUploadTime}:00` : singleUploadTime) : new Date().toTimeString().substring(0, 8);
        const [yr, mo, da] = dStr.split("-");
        const dt = new Date(`${yr}-${mo}-${da}T${tStr}`);
        if (!isNaN(dt.getTime())) {
          formattedCreatedAt = `${yr}-${mo}-${da} ${tStr}`;
          formattedUploadedAt = `${da}/${mo}/${yr}`;
        }
      } catch {}

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
        uploadedAt: formattedUploadedAt,
        created_at: formattedCreatedAt || undefined,
        saveToServer: saveToServer
      };

      const saved = await api.createVideo(newVideo);
      if (onAddVideo) onAddVideo(saved || newVideo);

      uploadHistory.updateItem(histId, {
        status: "published",
        progress: 100,
        currentStep: "Published Live",
        videoUrl: finalCleanUrl,
        videoId: saved?.id || ""
      });
      refreshHistory();

      showSuccess(`Video "${finalCleanTitle}" imported successfully from link!`);

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
      loadVideos();
    } catch (err) {
      uploadHistory.updateItem(histId, {
        status: "failed",
        error: err.message || "Failed to import video from link.",
        currentStep: "Failed"
      });
      refreshHistory();
      showError(err.message || "Failed to import video from link.");
    } finally {
      setIsImportingLink(false);
    }
  };

  // ==========================================
  // EXCEL IMPORT HANDLERS
  // ==========================================
  // Flexible Date & Time Parser for Excel Import & Custom Uploader
  const parseExcelDateTime = (rawDate, rawTime) => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");

    if (!rawDate && !rawTime) {
      const day = pad(now.getDate());
      const month = pad(now.getMonth() + 1);
      const year = now.getFullYear();
      const hours = pad(now.getHours());
      const minutes = pad(now.getMinutes());
      const seconds = pad(now.getSeconds());
      return {
        isoString: `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`,
        displayDate: `${day}/${month}/${year}`,
        displayTime: `${hours}:${minutes}:${seconds}`
      };
    }

    let day = now.getDate();
    let month = now.getMonth(); // 0-indexed
    let year = now.getFullYear();

    if (rawDate) {
      const dStr = String(rawDate).trim();
      // 1. DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
      const dmyMatch = dStr.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})$/);
      if (dmyMatch) {
        day = parseInt(dmyMatch[1], 10);
        month = parseInt(dmyMatch[2], 10) - 1;
        let yr = parseInt(dmyMatch[3], 10);
        if (yr < 100) yr += 2000;
        year = yr;
      } else {
        // 2. YYYY-MM-DD
        const ymdMatch = dStr.match(/^(\d{4})[\/\.-](\d{1,2})[\/\.-](\d{1,2})$/);
        if (ymdMatch) {
          year = parseInt(ymdMatch[1], 10);
          month = parseInt(ymdMatch[2], 10) - 1;
          day = parseInt(ymdMatch[3], 10);
        } else {
          const parsedD = new Date(dStr);
          if (!isNaN(parsedD.getTime())) {
            day = parsedD.getDate();
            month = parsedD.getMonth();
            year = parsedD.getFullYear();
          }
        }
      }
    }

    let hours = now.getHours();
    let minutes = now.getMinutes();
    let seconds = now.getSeconds();

    if (rawTime) {
      const tStr = String(rawTime).trim();
      const timeMatch = tStr.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)?$/i);
      if (timeMatch) {
        let h = parseInt(timeMatch[1], 10);
        minutes = parseInt(timeMatch[2], 10);
        seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
        const ampm = timeMatch[4] ? timeMatch[4].toLowerCase() : null;
        if (ampm === "pm" && h < 12) h += 12;
        if (ampm === "am" && h === 12) h = 0;
        hours = h;
      }
    }

    const finalDate = new Date(year, month, day, hours, minutes, seconds);
    const valid = !isNaN(finalDate.getTime());
    const finalYear = valid ? finalDate.getFullYear() : year;
    const finalMonth = valid ? finalDate.getMonth() + 1 : month + 1;
    const finalDay = valid ? finalDate.getDate() : day;
    const finalHours = valid ? finalDate.getHours() : hours;
    const finalMinutes = valid ? finalDate.getMinutes() : minutes;
    const finalSeconds = valid ? finalDate.getSeconds() : seconds;

    return {
      isoString: `${finalYear}-${pad(finalMonth)}-${pad(finalDay)} ${pad(finalHours)}:${pad(finalMinutes)}:${pad(finalSeconds)}`,
      displayDate: `${pad(finalDay)}/${pad(finalMonth)}/${finalYear}`,
      displayTime: `${pad(finalHours)}:${pad(finalMinutes)}:${pad(finalSeconds)}`
    };
  };

  const handleDownloadExcelTemplate = () => {
    const today = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const sampleDate = `${pad(today.getDate())}/${pad(today.getMonth() + 1)}/${today.getFullYear()}`;
    const sampleTime = `${pad(today.getHours())}:${pad(today.getMinutes())}:${pad(today.getSeconds())}`;

    const templateData = [
      {
        "Video URL": "https://vjs.zencdn.net/v/oceans.mp4",
        "Thumbnail URL": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800",
        "Title": "Sunset Over Mountain 4K",
        "Description": "Cinematic 4K mountain sunset view with calming ambience.",
        "Category": "Nature",
        "Tags": "sunset, nature, 4k, cinematic",
        "Duration": "04:30",
        "Initial Views": 0,
        "Initial Likes": 0,
        "Privacy": "Public",
        "Upload Date": sampleDate,
        "Upload Time": sampleTime
      },
      {
        "Video URL": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "Thumbnail URL": "",
        "Title": "",
        "Description": "",
        "Category": "",
        "Tags": "",
        "Duration": "",
        "Initial Views": 0,
        "Initial Likes": 0,
        "Privacy": "Public",
        "Upload Date": "",
        "Upload Time": ""
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    worksheet["!cols"] = [
      { wch: 45 }, // Video URL
      { wch: 45 }, // Thumbnail URL
      { wch: 30 }, // Title
      { wch: 40 }, // Description
      { wch: 16 }, // Category
      { wch: 25 }, // Tags
      { wch: 12 }, // Duration
      { wch: 14 }, // Initial Views
      { wch: 14 }, // Initial Likes
      { wch: 12 }, // Privacy
      { wch: 14 }, // Upload Date
      { wch: 14 }  // Upload Time
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "VideoTemplate");
    XLSX.writeFile(workbook, "video_import_template.xlsx");
  };

  // Extract and parse video publish date
  const getVideoDate = (v) => {
    const candidate = v?.created_at || v?.uploadedAt;
    if (!candidate) return null;

    if (typeof candidate === "string") {
      const dmy = candidate.trim().match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
      if (dmy) {
        const day = parseInt(dmy[1], 10);
        const month = parseInt(dmy[2], 10) - 1;
        const year = parseInt(dmy[3], 10);
        return new Date(year, month, day);
      }
    }

    const d = new Date(candidate);
    if (!isNaN(d.getTime())) return d;
    return null;
  };

  // Filter videos based on publish date, category and privacy
  const getFilteredExportVideos = () => {
    const sourceList = allExportVideos.length > 0 ? allExportVideos : (videosList.length > 0 ? videosList : initialVideos);
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    return sourceList.filter((v) => {
      // Storage vs External Link filter
      const isOurServer = isVideoOnOurServer(v);
      if (exportIncludeStorage && !exportIncludeLinks && !isOurServer) return false;
      if (!exportIncludeStorage && exportIncludeLinks && isOurServer) return false;

      // Category filter
      if (exportCategoryFilter !== "all" && (v.category || "General").toLowerCase() !== exportCategoryFilter.toLowerCase()) {
        return false;
      }

      // Privacy filter
      const vPriv = (v.privacy || v.status || "public").toLowerCase();
      if (exportPrivacyFilter === "public" && vPriv === "private") return false;
      if (exportPrivacyFilter === "private" && vPriv !== "private") return false;

      // Date filtering
      if (exportDateMode === "all") return true;

      const vDate = getVideoDate(v);
      if (!vDate) {
        return exportDateMode === "all" || exportDateMode === "today";
      }

      const vYear = vDate.getFullYear();
      const vMonth = String(vDate.getMonth() + 1).padStart(2, "0");
      const vDay = String(vDate.getDate()).padStart(2, "0");
      const vDateStr = `${vYear}-${vMonth}-${vDay}`;

      if (exportDateMode === "today") {
        return vDateStr === todayStr;
      }

      if (exportDateMode === "last7") {
        const past7 = new Date();
        past7.setDate(past7.getDate() - 7);
        past7.setHours(0, 0, 0, 0);
        return vDate >= past7;
      }

      if (exportDateMode === "last30") {
        const past30 = new Date();
        past30.setDate(past30.getDate() - 30);
        past30.setHours(0, 0, 0, 0);
        return vDate >= past30;
      }

      if (exportDateMode === "upto" && exportEndDate) {
        return vDateStr <= exportEndDate;
      }

      if (exportDateMode === "range") {
        if (exportStartDate && vDateStr < exportStartDate) return false;
        if (exportEndDate && vDateStr > exportEndDate) return false;
        return true;
      }

      return true;
    });
  };

  // Full Data Excel Export Handler (.xlsx format with date filter)
  const handleExecuteExcelExport = async () => {
    setIsExporting(true);
    try {
      const filteredVideos = getFilteredExportVideos();

      if (filteredVideos.length === 0) {
        showError("Is date filter ke hisaab se koi video nahi mili.");
        setIsExporting(false);
        return;
      }

      // Generate exact row format matching user's Excel column requirements
      const excelRows = filteredVideos.map((v) => {
        let uploadDate = "";
        let uploadTime = "";
        const candidate = v.created_at || v.uploadedAt;
        let d = null;
        if (candidate && !isNaN(new Date(candidate).getTime())) {
          d = new Date(candidate);
        }
        if (d) {
          const day = String(d.getDate()).padStart(2, "0");
          const month = String(d.getMonth() + 1).padStart(2, "0");
          uploadDate = `${day}/${month}/${d.getFullYear()}`;
          const hours = d.getHours();
          const minutes = String(d.getMinutes()).padStart(2, "0");
          const seconds = String(d.getSeconds()).padStart(2, "0");
          uploadTime = `${hours}:${minutes}:${seconds}`;
        } else {
          if (v.uploadedAt && v.uploadedAt.includes("/")) {
            uploadDate = v.uploadedAt;
          } else {
            const now = new Date();
            const day = String(now.getDate()).padStart(2, "0");
            const month = String(now.getMonth() + 1).padStart(2, "0");
            uploadDate = `${day}/${month}/${now.getFullYear()}`;
          }
          uploadTime = v.uploadTime || "12:00:00";
        }

        // Tags formatting
        let tagsStr = "";
        if (Array.isArray(v.tags)) {
          tagsStr = v.tags.join(", ");
        } else if (typeof v.tags === "string") {
          if (v.tags.trim().startsWith("[")) {
            try {
              const parsedTags = JSON.parse(v.tags);
              tagsStr = Array.isArray(parsedTags) ? parsedTags.join(", ") : v.tags;
            } catch {
              tagsStr = v.tags;
            }
          } else {
            tagsStr = v.tags;
          }
        }

        const rawPriv = String(v.privacy || v.status || "Public").toLowerCase();
        const privacy = rawPriv === "private" ? "Private" : "Public";

        // Excel strictly limits cell characters to 32,767. Large Base64 thumbnails or descriptions
        // exceed this threshold and cause SheetJS/Excel export to fail.
        const safeExcelStr = (val, maxLen = 32000) => {
          if (val === null || val === undefined) return "";
          const str = String(val);
          return str.length > maxLen ? str.slice(0, maxLen) : str;
        };

        const safeThumbnail = (() => {
          const t = String(v.thumbnail || "");
          if (!t) return "";
          if (t.startsWith("data:") && t.length > 30000) {
            return FALLBACK_THUMBNAIL;
          }
          return safeExcelStr(t, 32000);
        })();

        return {
          "Storage Type": safeExcelStr(isVideoOnOurServer(v) ? "Our Server (R2)" : "Other Person Storage (External)"),
          "Primary URL": safeExcelStr(v.videoUrl || ""),
          "Secondary URL": safeExcelStr(v.backup_url || v.other_ps_url || ""),
          "Active Source": safeExcelStr((v.active_source === "other_ps" || (!v.our_server_url && !isVideoOnOurServer(v))) ? "Other PS" : "Our Server"),
          "Synced to Server": safeExcelStr((Boolean(v.our_server_url) || (v.storage_source === "our_server" && isVideoOnOurServer(v))) ? "YES" : "NO"),
          "Video URL": safeExcelStr(v.videoUrl || ""),
          "Thumbnail URL": safeThumbnail,
          "Title": safeExcelStr(cleanDisplayTitle(v.title || "")),
          "Description": safeExcelStr(v.description || ""),
          "Category": safeExcelStr(v.category || "General"),
          "Tags": safeExcelStr(tagsStr),
          "Duration": safeExcelStr(v.duration || ""),
          "Initial Views": Number(v.views || 0),
          "Initial Likes": Number(v.likes || 0),
          "Privacy": safeExcelStr(privacy),
          "Upload Date": safeExcelStr(uploadDate),
          "Upload Time": safeExcelStr(uploadTime)
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(excelRows);
      worksheet["!cols"] = [
        { wch: 25 }, // Storage Type
        { wch: 45 }, // Primary URL
        { wch: 45 }, // Secondary URL
        { wch: 15 }, // Active Source
        { wch: 16 }, // Synced to Server
        { wch: 45 }, // Video URL
        { wch: 45 }, // Thumbnail URL
        { wch: 30 }, // Title
        { wch: 40 }, // Description
        { wch: 16 }, // Category
        { wch: 25 }, // Tags
        { wch: 12 }, // Duration
        { wch: 14 }, // Initial Views
        { wch: 14 }, // Initial Likes
        { wch: 12 }, // Privacy
        { wch: 14 }, // Upload Date
        { wch: 14 }  // Upload Time
      ];

      // Double safety guard: ensure NO cell in worksheet exceeds 32,000 characters
      Object.keys(worksheet).forEach((cellKey) => {
        if (cellKey.startsWith("!")) return;
        const cell = worksheet[cellKey];
        if (cell && cell.t === "s" && typeof cell.v === "string" && cell.v.length > 32000) {
          cell.v = cell.v.slice(0, 32000);
        }
      });

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Videos");

      let dateSlug = "all_videos";
      if (exportDateMode === "upto" && exportEndDate) {
        dateSlug = `upto_${exportEndDate}`;
      } else if (exportDateMode === "range" && (exportStartDate || exportEndDate)) {
        dateSlug = `${exportStartDate || "start"}_to_${exportEndDate || "end"}`;
      } else if (exportDateMode === "today") {
        dateSlug = "today";
      } else if (exportDateMode === "last7") {
        dateSlug = "last_7_days";
      } else if (exportDateMode === "last30") {
        dateSlug = "last_30_days";
      }

      const fileName = `viralkaam_videos_${dateSlug}.xlsx`;

      XLSX.writeFile(workbook, fileName);

      showSuccess(`Successfully exported ${excelRows.length} videos to ${fileName}!`);
    } catch (err) {
      console.error("[Export] Error generating excel:", err);
      showError("Export fail ho gaya: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportToExcel = handleExecuteExcelExport;

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
        const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false, dateNF: "dd/mm/yyyy" });

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
          let videoUrl = findVal(["Video URL", "VideoUrl", "URL", "Link", "Video"]);
          const duration = findVal(["Duration", "Time", "Length"]) || "";
          const initialViews = findVal(["Initial Views", "Views", "InitialViews"]);
          const initialLikes = findVal(["Initial Likes", "Likes", "InitialLikes"]);
          const privacyRaw = findVal(["Privacy", "Status", "Visibility"]) || "Public";
          const thumbnailRaw = findVal(["Thumbnail", "Thumbnail URL", "Thumb", "Poster", "Image"]);
          const uploadDateRaw = findVal(["Upload Date", "UploadDate", "Date", "Published Date", "Publish Date", "Created Date", "Date Uploaded"]);
          const uploadTimeRaw = findVal(["Upload Time", "UploadTime", "Time", "Published Time", "Publish Time", "Created Time", "Time Uploaded"]);
          const { isoString, displayDate, displayTime } = parseExcelDateTime(uploadDateRaw, uploadTimeRaw);

          // Auto-heal path mismatch if user placed URL in Title column or Title is a file path
          if (title && (title.startsWith("http://") || title.startsWith("https://"))) {
            if (!videoUrl) videoUrl = title;
            title = cleanDisplayTitle(title);
          } else if (!title && videoUrl) {
            title = cleanDisplayTitle(videoUrl);
          } else if (title) {
            title = cleanDisplayTitle(title);
          }

          if (!videoUrl) {
            rowErrors.push("Video URL is required");
          } else {
            videoUrl = cleanVideoUrl(videoUrl, "https://vjs.zencdn.net/v/oceans.mp4");
          }

          if (!title && videoUrl) {
            title = cleanDisplayTitle(videoUrl) || "Auto-detect from link";
          }

          const privacyClean = privacyRaw.toLowerCase() === "private" ? "private" : "public";

          const tags = tagsStr ? tagsStr.split(",").map((t) => t.trim()).filter(Boolean) : [category];

          // Check if video link is already in database
          const duplicateMatch = videoUrl ? checkDuplicateVideo(videoUrl) : null;

          const item = {
            rowNum,
            title,
            description,
            category,
            tags,
            videoUrl: videoUrl || "",
            thumbnail: thumbnailRaw || "",
            duration: duration || "",
            initialViews: parseInt(initialViews, 10) || 0,
            initialLikes: parseInt(initialLikes, 10) || 0,
            privacy: privacyClean,
            uploadDate: displayDate,
            uploadTime: displayTime,
            createdAt: isoString,
            isDuplicate: Boolean(duplicateMatch),
            duplicateTitle: duplicateMatch ? duplicateMatch.title : "",
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
    if (excelParsedRows.length === 0) {
      showError("Please select an Excel file first.");
      return;
    }

    // Confirmation if saveToServer is ON
    if (saveToServer) {
      const ok = window.confirm(
        "Notice: Save in Server Storage is ON.\n\nAll videos from this Excel sheet will be downloaded and permanently saved into your Server Storage (Cloudflare R2 / Uploads).\n\nClick OK to proceed, or Cancel to stop."
      );
      if (!ok) return;
    }

    setIsImportingExcel(true);
    setExcelProgress(0);

    const skippedList = [];
    const rowsToImport = [];

    excelParsedRows.forEach((r) => {
      if (!r.isValid) {
        skippedList.push({ ...r, reason: r.errors?.join(", ") || "Invalid data" });
      } else {
        const dup = checkDuplicateVideo(r.videoUrl);
        if (dup) {
          skippedList.push({
            ...r,
            isDuplicate: true,
            duplicateTitle: dup.title,
            reason: `Already published on website: "${dup.title}"`
          });
        } else {
          rowsToImport.push(r);
        }
      }
    });

    if (rowsToImport.length === 0) {
      setLastSkippedRows(skippedList);
      setIsImportingExcel(false);
      showError(`All ${excelParsedRows.length} rows were skipped: already published or invalid.`);
      return;
    }

    let importedCount = 0;
    for (let i = 0; i < rowsToImport.length; i++) {
      const row = rowsToImport[i];
      setExcelImportStep(`Importing ${i + 1} of ${rowsToImport.length}: ${row.title}...`);
      try {
        let finalTitle = row.title;
        let finalDescription = row.description;
        let finalThumbnail = row.thumbnail;
        let finalCategory = row.category;
        let finalTags = row.tags;
        let finalDuration = row.duration;

        // Auto-fetch if details missing from Excel
        if (!finalTitle || finalTitle === "Auto-detect from link" || !finalThumbnail || !finalDuration || !finalCategory || finalCategory === "General") {
          try {
            const meta = await api.fetchMetadata(row.videoUrl);
            if (meta && meta.success) {
              if (!finalTitle || finalTitle === "Auto-detect from link") finalTitle = meta.title || cleanDisplayTitle(row.videoUrl);
              if (!finalDescription) finalDescription = meta.description || `Watch ${finalTitle} on VIRALKAAM`;
              if (!finalThumbnail) finalThumbnail = meta.thumbnail || FALLBACK_THUMBNAIL;
              if (!finalCategory || finalCategory === "General") finalCategory = meta.category || "General";
              if (!finalTags || finalTags.length <= 1) finalTags = meta.tags || [finalCategory, "Trending"];
              if (!finalDuration) finalDuration = meta.duration || "";
            }
          } catch {}
        }

        if (!finalTitle || finalTitle === "Auto-detect from link") finalTitle = cleanDisplayTitle(row.videoUrl) || "Stream Video";
        if (!finalDescription) finalDescription = `Watch ${finalTitle} online on VIRALKAAM.`;
        if (!finalThumbnail) finalThumbnail = FALLBACK_THUMBNAIL;
        if (!finalCategory) finalCategory = "General";
        if (!finalTags || finalTags.length === 0) finalTags = ["Trending", "Viral"];

        const formattedCreatedAt = row.createdAt ? row.createdAt.replace('T', ' ').substring(0, 19) : undefined;

        const newVideo = {
          title: finalTitle,
          description: finalDescription,
          category: finalCategory,
          tags: finalTags,
          duration: finalDuration || "",
          videoUrl: row.videoUrl,
          thumbnail: finalThumbnail,
          privacy: row.privacy || "public",
          status: (row.privacy || "").toLowerCase() === "private" ? "private" : "published",
          initial_views: Number(row.initialViews) || 0,
          initial_likes: Number(row.initialLikes) || 0,
          views: Number(row.initialViews) || 0,
          likes: Number(row.initialLikes) || 0,
          author: "Admin",
          uploadedAt: row.uploadDate || "Just now",
          created_at: formattedCreatedAt,
          saveToServer: saveToServer
        };

        const saved = await api.createVideo(newVideo);
        if (onAddVideo) onAddVideo(saved || newVideo);

        importedCount++;
        setExcelProgress(Math.round((importedCount / rowsToImport.length) * 100));

        uploadHistory.addItem({
          id: `excel-${Date.now()}-${row.rowNum}`,
          title: finalTitle,
          type: "Excel Import",
          fileName: excelFile?.name || "Excel Batch",
          fileSize: `Row ${row.rowNum}`,
          duration: finalDuration,
          thumbnail: finalThumbnail,
          status: "published",
          progress: 100,
          currentStep: "Published Live",
          videoUrl: row.videoUrl,
          videoId: saved?.id || ""
        });
      } catch (err) {
        console.warn(`Failed row ${row.rowNum}:`, err);
        skippedList.push({ ...row, reason: err.message || "Failed to import row" });
      }
    }

    setLastSkippedRows(skippedList);
    refreshHistory();
    setIsImportingExcel(false);
    setExcelImportStep("");

    if (skippedList.length > 0) {
      showSuccess(`✓ Imported ${importedCount} videos! ${skippedList.length} rows were skipped (already in database).`);
    } else {
      showSuccess(`✓ All ${importedCount} videos imported and published successfully!`);
    }

    loadStatsAndCategories();
    loadVideos();
  };

  // ==========================================
  // EDIT VIDEO HANDLERS
  // ==========================================
  const handleStartEdit = (video) => {
    const cleanUrl = cleanVideoUrl(video.videoUrl || video.title || "");
    const cleanThumb = video.thumbnail || FALLBACK_THUMBNAIL;
    const currentViews = video.views !== undefined ? Number(video.views) : (video.initial_views !== undefined ? Number(video.initial_views) : 0);
    const currentLikes = video.likes !== undefined ? Number(video.likes) : (video.initial_likes !== undefined ? Number(video.initial_likes) : 0);

    let initDate = "";
    let initTime = "";
    const candidate = video.created_at || video.uploadedAt;
    if (candidate) {
      const dt = new Date(candidate);
      if (!isNaN(dt.getTime())) {
        initDate = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
        initTime = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}:${String(dt.getSeconds()).padStart(2, "0")}`;
      } else if (typeof candidate === "string") {
        const dmy = candidate.trim().match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
        if (dmy) {
          initDate = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
          initTime = "12:00:00";
        }
      }
    }
    setEditUploadDate(initDate);
    setEditUploadTime(initTime);

    setEditingVideo({
      ...video,
      title: cleanDisplayTitle(video.title),
      videoUrl: cleanUrl,
      thumbnail: cleanThumb,
      tags: Array.isArray(video.tags) ? video.tags : [],
      privacy: video.privacy || (video.status === "private" ? "private" : "public"),
      duration: video.duration || "00:00",
      views: currentViews,
      likes: currentLikes,
      initial_views: currentViews,
      initial_likes: currentLikes
    });
    setEditFile(null);
    setEditThumbnailFile(null);
    setEditVideoDurationSecs(0);
    setEditCurrentScrubTime(0);
    setActiveNav("edit");
  };

  const handleCaptureEditVideoFrame = () => {
    const vid = editVideoPlayerRef.current;
    if (!vid) {
      showError("Video player is not ready yet.");
      return;
    }
    try {
      const canvas = document.createElement("canvas");
      canvas.width = vid.videoWidth || 640;
      canvas.height = vid.videoHeight || 360;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
      setEditingVideo((prev) => ({
        ...prev,
        thumbnail: dataUrl
      }));
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `edit-thumb-${Math.floor(vid.currentTime)}s.jpg`, { type: "image/jpeg" });
          setEditThumbnailFile(file);
        }
      }, "image/jpeg", 0.88);
      showSuccess(`✓ Frame captured at ${formatSecsToTime(vid.currentTime)} as new thumbnail!`);
    } catch (err) {
      console.warn("Capture frame error:", err);
      showError("Could not capture frame: " + err.message);
    }
  };

  const handleEditAutoFetchMetadata = async () => {
    if (!editingVideo || !editingVideo.videoUrl) {
      showError("Please enter a Video URL first.");
      return;
    }
    setIsEditFetchingMeta(true);
    try {
      const data = await api.fetchMetadata(editingVideo.videoUrl);
      if (data && data.success) {
        setEditingVideo((prev) => ({
          ...prev,
          title: data.title || prev.title,
          description: data.description || prev.description,
          thumbnail: data.thumbnail || prev.thumbnail,
          duration: data.duration || prev.duration,
          category: data.category || prev.category,
          tags: Array.isArray(data.tags) && data.tags.length > 0 ? Array.from(new Set([...prev.tags, ...data.tags])) : prev.tags
        }));
        showSuccess("✓ Video details updated from link!");
      } else {
        const cleanT = cleanDisplayTitle(editingVideo.videoUrl);
        if (cleanT) {
          setEditingVideo((prev) => ({ ...prev, title: cleanT }));
        }
        showSuccess("✓ Video title updated from link.");
      }
    } catch (err) {
      showError("Failed to fetch metadata: " + err.message);
    } finally {
      setIsEditFetchingMeta(false);
    }
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
    if (e && typeof e.preventDefault === "function") e.preventDefault();
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

      const viewsNum = Number(editingVideo.views !== undefined ? editingVideo.views : editingVideo.initial_views) || 0;
      const likesNum = Number(editingVideo.likes !== undefined ? editingVideo.likes : editingVideo.initial_likes) || 0;

      let formattedCreatedAt = undefined;
      let formattedUploadedAt = undefined;
      if (editUploadDate) {
        const tStr = editUploadTime ? (editUploadTime.length === 5 ? `${editUploadTime}:00` : editUploadTime) : "12:00:00";
        const [yr, mo, da] = editUploadDate.split("-");
        const dt = new Date(`${yr}-${mo}-${da}T${tStr}`);
        if (!isNaN(dt.getTime())) {
          formattedCreatedAt = `${yr}-${mo}-${da} ${tStr}`;
          formattedUploadedAt = `${da}/${mo}/${yr}`;
        }
      }

      const updatedPayload = {
        ...editingVideo,
        videoUrl: finalVideoUrl,
        thumbnail: finalThumbnail,
        privacy: editingVideo.privacy,
        status: editingVideo.privacy === "private" ? "private" : "published",
        views: viewsNum,
        likes: likesNum,
        initial_views: viewsNum,
        initial_likes: likesNum,
        duration: editingVideo.duration || (editVideoDurationSecs ? formatSecsToTime(editVideoDurationSecs) : "00:00"),
        uploadedAt: formattedUploadedAt || editingVideo.uploadedAt,
        created_at: formattedCreatedAt || editingVideo.created_at
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

  // ==========================================
  // TAGS HANDLERS
  // ==========================================
  const handleAddTag = async (e) => {
    e.preventDefault();
    if (!newTagName.trim()) return;

    try {
      await api.createTag(newTagName.trim());
      showSuccess(`Tag "${newTagName.trim()}" added successfully!`);
      setNewTagName("");
      loadStatsAndCategories();
    } catch (err) {
      showError(err.message || "Failed to add tag.");
    }
  };

  const handleUpdateTag = async (id) => {
    if (!editingTagName.trim()) return;

    try {
      await api.updateTag(id, editingTagName.trim());
      showSuccess(`Tag updated to "${editingTagName.trim()}"!`);
      setEditingTagId(null);
      setEditingTagName("");
      loadStatsAndCategories();
      loadVideos();
    } catch (err) {
      showError(err.message || "Failed to update tag.");
    }
  };

  const handleDeleteTag = async (tag) => {
    if (window.confirm(`Are you sure you want to delete tag "${tag.name}"?`)) {
      try {
        await api.deleteTag(tag.id);
        showSuccess(`Tag "${tag.name}" deleted successfully.`);
        loadStatsAndCategories();
        loadVideos();
      } catch (err) {
        showError(err.message || "Failed to delete tag.");
      }
    }
  };

  const handleClearDummyData = async () => {
    if (window.confirm("Are you sure you want to clean old dummy/test videos from the database?")) {
      try {
        const res = await api.clearDummyData();
        showSuccess(res.message || "Old dummy data cleared successfully!");
        loadStatsAndCategories();
        loadVideos();
      } catch (err) {
        showError(err.message || "Failed to clear dummy data.");
      }
    }
  };

  // Storage & Other PS statistics for sidebar & screens
  const allCurrentList = getAllCurrentVideos();
  const otherPsList = allCurrentList.filter(isOtherPsVideo);
  const totalOtherPsCount = otherPsList.length;
  const syncedOtherPsCount = otherPsList.filter(isOtherPsSynced).length;
  const pendingOtherPsCount = otherPsList.filter((v) => !isOtherPsSynced(v)).length;
  const ourServerStreamCount = otherPsList.filter((v) => isOtherPsSynced(v) && (v.active_source || "our_server") === "our_server").length;
  const otherPsStreamCount = otherPsList.filter((v) => v.active_source === "other_ps" || !isOtherPsSynced(v)).length;
  const ourServerOnlyCount = allCurrentList.filter(isVideoOnOurServer).length;
  const otherPsOnlyCount = otherPsList.length;

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
            className={`vap-nav-item ${activeNav === "history" ? "active" : ""}`}
            onClick={() => {
              refreshHistory();
              setActiveNav("history");
            }}
          >
            <History size={18} />
            <span>Upload History</span>
            {historyList.length > 0 && (
              <span
                style={{
                  marginLeft: "auto",
                  background: "rgba(255, 255, 255, 0.16)",
                  borderRadius: "10px",
                  padding: "1px 7px",
                  fontSize: "0.72rem",
                  fontWeight: 600
                }}
              >
                {historyList.length}
              </span>
            )}
          </button>

          <button
            className={`vap-nav-item ${activeNav === "other_ps" ? "active" : ""}`}
            onClick={() => {
              setActiveNav("other_ps");
              loadAllVideosForExport();
            }}
          >
            <HardDrive size={18} />
            <span>Other PS</span>
            {pendingOtherPsCount > 0 ? (
              <span
                style={{
                  marginLeft: "auto",
                  background: "#f59e0b",
                  color: "#000",
                  borderRadius: "10px",
                  padding: "1px 7px",
                  fontSize: "0.72rem",
                  fontWeight: 700
                }}
                title={`${pendingOtherPsCount} video(s) pending sync to server storage`}
              >
                {pendingOtherPsCount}
              </span>
            ) : totalOtherPsCount > 0 ? (
              <span
                style={{
                  marginLeft: "auto",
                  background: "rgba(255, 255, 255, 0.16)",
                  borderRadius: "10px",
                  padding: "1px 7px",
                  fontSize: "0.72rem",
                  fontWeight: 600
                }}
              >
                {totalOtherPsCount}
              </span>
            ) : null}
          </button>

          <button
            className={`vap-nav-item ${activeNav === "categories" ? "active" : ""}`}
            onClick={() => setActiveNav("categories")}
          >
            <FolderOpen size={18} />
            <span>Categories</span>
            {Array.isArray(categoriesList) && categoriesList.length > 0 && (
              <span
                style={{
                  marginLeft: "auto",
                  background: "rgba(255, 255, 255, 0.16)",
                  borderRadius: "10px",
                  padding: "1px 7px",
                  fontSize: "0.72rem",
                  fontWeight: 600
                }}
              >
                {categoriesList.length}
              </span>
            )}
          </button>

          <button
            className={`vap-nav-item ${activeNav === "tags" ? "active" : ""}`}
            onClick={() => setActiveNav("tags")}
          >
            <Tag size={18} />
            <span>Tags</span>
            {Array.isArray(tagsList) && tagsList.length > 0 && (
              <span
                style={{
                  marginLeft: "auto",
                  background: "rgba(255, 255, 255, 0.16)",
                  borderRadius: "10px",
                  padding: "1px 7px",
                  fontSize: "0.72rem",
                  fontWeight: 600
                }}
              >
                {tagsList.length}
              </span>
            )}
          </button>

          <button
            className={`vap-nav-item ${activeNav === "export" ? "active" : ""}`}
            onClick={() => {
              setActiveNav("export");
              loadAllVideosForExport();
            }}
          >
            <FileSpreadsheet size={18} />
            <span>Export Data</span>
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
              <div className="vap-page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 className="vap-page-title">Dashboard</h2>
                <button
                  className="vap-btn-outline danger"
                  onClick={handleClearDummyData}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", padding: "6px 12px" }}
                  title="Remove old test and dummy videos from database"
                >
                  <Trash2 size={15} />
                  <span>Clear Old Dummy Data</span>
                </button>
              </div>

              {/* Summary Stats Row */}
              <div className="vap-stats-grid">
                <div className="vap-stat-card">
                  <div className="vap-stat-icon blue">
                    <Film size={22} />
                  </div>
                  <div className="vap-stat-meta">
                    <span className="vap-stat-label">Total Videos</span>
                    <span className="vap-stat-value">{Number(stats?.totalVideos || 0).toLocaleString()}</span>
                  </div>
                </div>

                <div className="vap-stat-card">
                  <div className="vap-stat-icon green">
                    <Eye size={22} />
                  </div>
                  <div className="vap-stat-meta">
                    <span className="vap-stat-label">Total Views</span>
                    <span className="vap-stat-value">{Number(stats?.totalViews || 0).toLocaleString()}</span>
                  </div>
                </div>

                <div className="vap-stat-card">
                  <div className="vap-stat-icon purple">
                    <FolderOpen size={22} />
                  </div>
                  <div className="vap-stat-meta">
                    <span className="vap-stat-label">Total Categories</span>
                    <span className="vap-stat-value">{Number(stats?.totalCategories || 0).toLocaleString()}</span>
                  </div>
                </div>

                <div className="vap-stat-card">
                  <div className="vap-stat-icon orange">
                    <Tag size={22} />
                  </div>
                  <div className="vap-stat-meta">
                    <span className="vap-stat-label">Total Tags</span>
                    <span className="vap-stat-value">{Number(stats?.totalTags || tagsList?.length || 0).toLocaleString()}</span>
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
                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="vap-btn-secondary"
                    onClick={() => {
                      setActiveNav("export");
                      loadAllVideosForExport();
                    }}
                    style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
                    title="Export videos to Excel (.xlsx)"
                  >
                    <FileSpreadsheet size={16} />
                    <span>Export to Excel</span>
                  </button>
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
              SCREEN 3: UPLOAD VIDEO (Unified New Layout)
              ======================================================== */}
          {activeNav === "upload" && (
            <div>
              {/* ── Publish header bar ── */}
              <div className="vap-publish-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                <h2 className="vap-page-title" style={{ margin: 0 }}>Upload Video</h2>
                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                  {/* Server Storage Pill (Persisted in localStorage) */}
                  <button
                    type="button"
                    onClick={() => handleToggleSaveToServer()}
                    title={saveToServer ? "Server Storage is ON: Videos & thumbnails will be saved in server storage (Cloudflare R2)" : "Server Storage is OFF: Direct stream link will be used"}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "7px",
                      padding: "8px 14px",
                      borderRadius: "8px",
                      border: saveToServer ? "1px solid #16a34a" : "1px solid #94a3b8",
                      background: saveToServer ? "#dcfce7" : "#f1f5f9",
                      color: saveToServer ? "#15803d" : "#475569",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                      cursor: "pointer",
                      transition: "all 0.15s ease"
                    }}
                  >
                    <Server size={15} color={saveToServer ? "#16a34a" : "#64748b"} />
                    <span>Storage: <strong style={{ color: saveToServer ? "#15803d" : "#0f172a" }}>{saveToServer ? "ON" : "OFF"}</strong></span>
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: saveToServer ? "#16a34a" : "#94a3b8",
                        display: "inline-block"
                      }}
                    />
                  </button>

                  {/* Import from Excel Button */}
                  <button
                    type="button"
                    className="vap-btn-secondary"
                    onClick={() => setShowImportExcelModal(true)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "7px",
                      padding: "8px 16px",
                      fontSize: "0.88rem",
                      fontWeight: 600,
                      background: "#f0fdf4",
                      color: "#166534",
                      border: "1px solid #86efac",
                      borderRadius: "8px",
                      cursor: "pointer"
                    }}
                  >
                    <FileSpreadsheet size={16} color="#16a34a" />
                    <span>Import from Excel</span>
                  </button>

                  {/* Publish Video Button */}
                  <button
                    type="button"
                    className="vap-btn-primary"
                    style={{
                      padding: "9px 22px",
                      fontSize: "0.92rem",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "7px",
                      opacity: isUploadingSingle ? 0.75 : 1,
                      cursor: isUploadingSingle ? "not-allowed" : "pointer"
                    }}
                    disabled={isUploadingSingle || isFetchingMeta}
                    onClick={handleSingleUploadSubmit}
                  >
                    {isUploadingSingle ? (
                      <><Loader2 className="animate-spin" size={16} /> Publishing...</>
                    ) : (
                      <><UploadCloud size={16} /> Publish Video</>
                    )}
                  </button>
                </div>
              </div>

              {/* ── Main two-column card ── */}
              <div className="vap-card" style={{ marginTop: "16px" }}>
                <div className="vap-two-col-layout">

                  {/* ════ LEFT COLUMN (Video Link, Local File Select with Preview, Thumbnail Link, Local Thumbnail Select with Preview) ════ */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>

                    {/* 1. Video Link */}
                    <div className="vap-form-group" style={{ margin: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <label style={{ margin: 0, fontWeight: 600, fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "6px" }}>
                          <LinkIcon size={15} color="#2563eb" />
                          <span>Video link</span>
                        </label>
                        {singleVideoUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setSingleVideoUrl("");
                              setLinkUrl("");
                            }}
                            style={{ background: "none", border: "none", color: "#dc2626", fontSize: "0.78rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "3px" }}
                          >
                            <X size={12} /> Clear Link
                          </button>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <input
                          type="url"
                          className="vap-input"
                          placeholder="Paste video link (YouTube, direct MP4, M3U8, etc.)..."
                          value={singleVideoUrl}
                          onChange={(e) => {
                            const val = e.target.value;
                            handleSingleVideoUrlChange(val);
                            setLinkUrl(val);
                          }}
                          onPaste={(e) => {
                            const pasted = e.clipboardData.getData("text");
                            if (pasted && (pasted.startsWith("http://") || pasted.startsWith("https://"))) {
                              setTimeout(() => handleAutoFetchMetadata(pasted), 120);
                            }
                          }}
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          className="vap-fetch-btn"
                          disabled={isFetchingMeta || !singleVideoUrl.trim()}
                          onClick={() => handleAutoFetchMetadata(singleVideoUrl)}
                          title="Auto-fetch video details from this link"
                        >
                          {isFetchingMeta ? (
                            <><Loader2 className="animate-spin" size={14} /> Fetching...</>
                          ) : (
                            <><Zap size={14} /> Auto-Fetch</>
                          )}
                        </button>
                      </div>

                      {/* Instant Duplicate Check Warning (<1ms) */}
                      {singleVideoUrl && checkDuplicateVideo(singleVideoUrl) && (
                        <div style={{
                          marginTop: "8px",
                          padding: "8px 12px",
                          background: "#fef2f2",
                          border: "1px solid #fecaca",
                          borderRadius: "6px",
                          fontSize: "0.80rem",
                          color: "#991b1b",
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "8px"
                        }}>
                          <AlertCircle size={15} color="#dc2626" style={{ marginTop: "2px", flexShrink: 0 }} />
                          <div>
                            <strong>Already Published:</strong> This video already exists in your database:
                            <div style={{ fontWeight: 600, marginTop: "2px", color: "#b91c1c" }}>
                              "{checkDuplicateVideo(singleVideoUrl).title}"
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 2. Video Preview & Local File Select */}
                    <div className="vap-form-group" style={{ margin: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <label style={{ margin: 0, fontWeight: 600, fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "6px" }}>
                          <UploadCloud size={15} color="#2563eb" />
                          <span>Video Preview {singleFile ? "(Local File)" : (singleVideoUrl ? "(Link Preview)" : "")}</span>
                        </label>
                        {(singleFile || singleVideoUrl) && (
                          <button
                            type="button"
                            onClick={() => {
                              setSingleFile(null);
                              setSingleVideoUrl("");
                              setLinkUrl("");
                              setVideoDurationSecs(0);
                              setCurrentScrubTime(0);
                              if (singleVideoInputRef.current) singleVideoInputRef.current.value = "";
                            }}
                            style={{ background: "none", border: "none", color: "#dc2626", fontSize: "0.78rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "3px" }}
                          >
                            <Trash2 size={12} /> Clear Video
                          </button>
                        )}
                      </div>

                      <input
                        type="file"
                        ref={singleVideoInputRef}
                        accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm,video/*"
                        style={{ display: "none" }}
                        onChange={(e) => handleSingleFileSelect(e.target.files?.[0])}
                      />

                      {/* Condition 1: Local File Selected */}
                      {singleFile ? (
                        <div style={{ background: "#0f172a", borderRadius: "10px", padding: "12px", border: "1.5px solid #334155" }}>
                          <video
                            ref={videoPlayerRef}
                            src={URL.createObjectURL(singleFile)}
                            controls
                            crossOrigin="anonymous"
                            style={{ width: "100%", maxHeight: "200px", borderRadius: "6px", background: "#000", display: "block" }}
                            onLoadedMetadata={(e) => {
                              const d = e.target.duration || 0;
                              setVideoDurationSecs(d);
                              if (!singleDuration || singleDuration === "00:00") {
                                setSingleDuration(formatSecsToTime(d));
                              }
                            }}
                            onTimeUpdate={(e) => {
                              setCurrentScrubTime(e.target.currentTime);
                            }}
                          />
                          <div style={{ marginTop: "8px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.82rem" }}>
                            <span style={{ color: "#22c55e", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>
                              ✓ Local File: {singleFile.name}
                            </span>
                            <span style={{ color: "#94a3b8" }}>
                              {(singleFile.size / (1024 * 1024)).toFixed(1)} MB {videoDurationSecs ? `| ${formatSecsToTime(videoDurationSecs)}` : ""}
                            </span>
                          </div>

                          {/* Timeline Frame Scrubber */}
                          <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #1e293b" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                              <span style={{ color: "#cbd5e1", fontSize: "0.78rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "5px" }}>
                                <Film size={13} color="#38bdf8" /> Video Timeline Scrubber:
                              </span>
                              <span style={{ color: "#38bdf8", fontSize: "0.78rem", fontFamily: "monospace", fontWeight: 700 }}>
                                {formatSecsToTime(currentScrubTime)} / {formatSecsToTime(videoDurationSecs)}
                              </span>
                            </div>

                            <input
                              type="range"
                              min={0}
                              max={videoDurationSecs || 100}
                              step={0.1}
                              value={currentScrubTime}
                              onChange={(e) => {
                                const t = parseFloat(e.target.value) || 0;
                                setCurrentScrubTime(t);
                                if (videoPlayerRef.current) {
                                  videoPlayerRef.current.currentTime = t;
                                }
                              }}
                              style={{ width: "100%", accentColor: "#2563eb", cursor: "pointer", height: "6px" }}
                            />

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px", gap: "6px", flexWrap: "wrap" }}>
                              <div style={{ display: "flex", gap: "4px" }}>
                                {[
                                  { label: "0s", time: 0 },
                                  { label: "5s", time: 5 },
                                  { label: "15s", time: 15 },
                                  { label: "30s", time: 30 },
                                  { label: "Mid", time: videoDurationSecs ? videoDurationSecs / 2 : 10 },
                                ].map((btn, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => {
                                      const t = Math.min(btn.time, videoDurationSecs || btn.time);
                                      setCurrentScrubTime(t);
                                      if (videoPlayerRef.current) videoPlayerRef.current.currentTime = t;
                                    }}
                                    style={{
                                      background: "#1e293b",
                                      border: "1px solid #475569",
                                      color: "#e2e8f0",
                                      fontSize: "0.72rem",
                                      padding: "3px 7px",
                                      borderRadius: "4px",
                                      cursor: "pointer"
                                    }}
                                  >
                                    {btn.label}
                                  </button>
                                ))}
                              </div>

                              <button
                                type="button"
                                onClick={handleCaptureCurrentVideoFrame}
                                style={{
                                  background: "#2563eb",
                                  color: "#ffffff",
                                  border: "none",
                                  borderRadius: "5px",
                                  padding: "5px 10px",
                                  fontSize: "0.78rem",
                                  fontWeight: 600,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "5px",
                                  cursor: "pointer"
                                }}
                                title="Capture frame at current video time as thumbnail"
                              >
                                <Camera size={13} />
                                <span>Capture Frame as Thumbnail</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : singleVideoUrl ? (
                        /* Condition 2: Video Link provided (YouTube or Direct Link Preview) */
                        (() => {
                          const ytMatch = singleVideoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
                          const ytId = ytMatch ? ytMatch[1] : null;

                          return (
                            <div style={{ background: "#0f172a", borderRadius: "10px", padding: "12px", border: "1.5px solid #334155" }}>
                              {ytId ? (
                                <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", maxHeight: "200px", borderRadius: "6px", overflow: "hidden", background: "#000" }}>
                                  <iframe
                                    src={`https://www.youtube.com/embed/${ytId}`}
                                    title="YouTube Preview"
                                    style={{ width: "100%", height: "100%", border: "none" }}
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                  />
                                </div>
                              ) : (
                                <video
                                  ref={videoPlayerRef}
                                  src={cleanVideoUrl(singleVideoUrl)}
                                  controls
                                  crossOrigin="anonymous"
                                  style={{ width: "100%", maxHeight: "200px", borderRadius: "6px", background: "#000", display: "block" }}
                                  onLoadedMetadata={(e) => {
                                    const d = e.target.duration || 0;
                                    setVideoDurationSecs(d);
                                    if (!singleDuration || singleDuration === "00:00") {
                                      setSingleDuration(formatSecsToTime(d));
                                    }
                                  }}
                                  onTimeUpdate={(e) => {
                                    setCurrentScrubTime(e.target.currentTime);
                                  }}
                                />
                              )}

                              <div style={{ marginTop: "8px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.82rem" }}>
                                <span style={{ color: "#22c55e", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "65%" }}>
                                  ✓ Link Connected: {ytId ? `YouTube (${ytId})` : cleanDisplayTitle(singleVideoUrl)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => singleVideoInputRef.current?.click()}
                                  style={{ background: "#1e293b", border: "1px solid #475569", color: "#93c5fd", borderRadius: "4px", padding: "3px 8px", fontSize: "0.74rem", cursor: "pointer" }}
                                >
                                  Switch to Local File
                                </button>
                              </div>

                              {/* Timeline Frame Scrubber for direct video links */}
                              {!ytId && (
                                <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #1e293b" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                                    <span style={{ color: "#cbd5e1", fontSize: "0.78rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "5px" }}>
                                      <Film size={13} color="#38bdf8" /> Video Timeline Scrubber:
                                    </span>
                                    <span style={{ color: "#38bdf8", fontSize: "0.78rem", fontFamily: "monospace", fontWeight: 700 }}>
                                      {formatSecsToTime(currentScrubTime)} / {formatSecsToTime(videoDurationSecs)}
                                    </span>
                                  </div>

                                  <input
                                    type="range"
                                    min={0}
                                    max={videoDurationSecs || 100}
                                    step={0.1}
                                    value={currentScrubTime}
                                    onChange={(e) => {
                                      const t = parseFloat(e.target.value) || 0;
                                      setCurrentScrubTime(t);
                                      if (videoPlayerRef.current) {
                                        videoPlayerRef.current.currentTime = t;
                                      }
                                    }}
                                    style={{ width: "100%", accentColor: "#2563eb", cursor: "pointer", height: "6px" }}
                                  />

                                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
                                    <button
                                      type="button"
                                      onClick={handleCaptureCurrentVideoFrame}
                                      style={{
                                        background: "#2563eb",
                                        color: "#ffffff",
                                        border: "none",
                                        borderRadius: "5px",
                                        padding: "5px 10px",
                                        fontSize: "0.78rem",
                                        fontWeight: 600,
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "5px",
                                        cursor: "pointer"
                                      }}
                                    >
                                      <Camera size={13} />
                                      <span>Capture Frame as Thumbnail</span>
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()
                      ) : (
                        /* Condition 3: Neither file nor link - Dropzone */
                        <div
                          className="vap-dropzone"
                          onClick={() => singleVideoInputRef.current?.click()}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (e.dataTransfer.files?.[0]) handleSingleFileSelect(e.dataTransfer.files[0]);
                          }}
                          style={{ padding: "20px 14px", minHeight: "110px", cursor: "pointer" }}
                        >
                          <div className="vap-dropzone-icon" style={{ marginBottom: "6px" }}><UploadCloud size={24} /></div>
                          <div className="vap-dropzone-prompt" style={{ fontSize: "0.88rem" }}>
                            Choose Local Video File or Drag & Drop Here
                          </div>
                          <span className="vap-dropzone-sub" style={{ fontSize: "0.76rem", marginTop: "4px" }}>
                            MP4, MOV, MKV, WEBM (Or paste video link in the box above)
                          </span>
                        </div>
                      )}
                    </div>

                    {/* 3. Thumbnail Link */}
                    <div className="vap-form-group" style={{ margin: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <label style={{ margin: 0, fontWeight: 600, fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "6px" }}>
                          <LinkIcon size={15} color="#16a34a" />
                          <span>Thumbnail link</span>
                        </label>
                        {singleThumbnailUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setSingleThumbnailUrl("");
                              if (!singleThumbnailFile) setSingleThumbnail("");
                            }}
                            style={{ background: "none", border: "none", color: "#dc2626", fontSize: "0.78rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "3px" }}
                          >
                            <X size={12} /> Clear
                          </button>
                        )}
                      </div>
                      <input
                        type="url"
                        className="vap-input"
                        placeholder="Paste Thumbnail image URL (https://...jpg, png, webp)"
                        value={singleThumbnailUrl}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSingleThumbnailUrl(val);
                          setSingleThumbnail(val);
                          setLinkThumbnail(val);
                          setSingleThumbnailFile(null);
                        }}
                      />
                    </div>

                    {/* 4. Local Thumbnail Select (Ise me preview aa jayega) */}
                    <div className="vap-form-group" style={{ margin: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <label style={{ margin: 0, fontWeight: 600, fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "6px" }}>
                          <Film size={15} color="#16a34a" />
                          <span>Local thumbnail select (Preview)</span>
                        </label>
                        {(singleThumbnail || singleThumbnailUrl || singleThumbnailFile) && (
                          <button
                            type="button"
                            onClick={() => {
                              setSingleThumbnail("");
                              setSingleThumbnailFile(null);
                              setSingleThumbnailUrl("");
                              setLinkThumbnail("");
                              if (singleThumbInputRef.current) singleThumbInputRef.current.value = "";
                            }}
                            style={{ background: "none", border: "none", color: "#dc2626", fontSize: "0.78rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "3px" }}
                          >
                            <Trash2 size={12} /> Remove Thumbnail
                          </button>
                        )}
                      </div>

                      <input
                        type="file"
                        ref={singleThumbInputRef}
                        accept="image/jpeg,image/png,image/webp"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setSingleThumbnailFile(file);
                            const obj = URL.createObjectURL(file);
                            setSingleThumbnail(obj);
                            setSingleThumbnailUrl(obj);
                            setLinkThumbnail(obj);
                          }
                        }}
                      />

                      <div
                        style={{
                          width: "100%",
                          aspectRatio: "16 / 9",
                          maxHeight: "180px",
                          borderRadius: "10px",
                          background: "#0f172a",
                          border: "2px dashed #334155",
                          overflow: "hidden",
                          position: "relative",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer"
                        }}
                        onClick={() => singleThumbInputRef.current?.click()}
                        title="Click to choose local thumbnail image"
                      >
                        {(singleThumbnailUrl || singleThumbnail) ? (
                          <img
                            src={singleThumbnailUrl || singleThumbnail}
                            alt="Thumbnail Preview"
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        ) : (
                          <div style={{ textAlign: "center", color: "#94a3b8", padding: "16px" }}>
                            <Film size={28} style={{ margin: "0 auto 6px", opacity: 0.8 }} />
                            <div style={{ fontSize: "0.84rem", fontWeight: 500 }}>Click to Choose Local Thumbnail Image</div>
                            <div style={{ fontSize: "0.74rem", color: "#64748b", marginTop: "2px" }}>PNG, JPG, WEBP (16:9 Recommended)</div>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>

                  {/* ════ RIGHT COLUMN (Unified State for File & Link) ════ */}
                  <div>
                    {/* Title */}
                    <div className="vap-form-group">
                      <label>Title <span className="required">*</span></label>
                      <input
                        type="text"
                        className="vap-input"
                        placeholder="Enter video title"
                        value={singleTitle}
                        onChange={(e) => {
                          setSingleTitle(e.target.value);
                          setLinkTitle(e.target.value);
                        }}
                        required
                      />
                    </div>

                    {/* Description */}
                    <div className="vap-form-group">
                      <label>Description</label>
                      <textarea
                        className="vap-textarea"
                        placeholder="Write a short description..."
                        value={singleDescription}
                        onChange={(e) => {
                          setSingleDescription(e.target.value);
                          setLinkDescription(e.target.value);
                        }}
                      />
                    </div>

                    {/* Category */}
                    <div className="vap-form-group">
                      <label>Category <span className="required">*</span></label>
                      <select
                        className="vap-form-select"
                        value={singleCategory}
                        onChange={(e) => {
                          setSingleCategory(e.target.value);
                          setLinkCategory(e.target.value);
                        }}
                      >
                        {categoriesList.map((c) => (
                          <option key={c.id || c.name} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Tags */}
                    {singleSourceType !== "excel" && (
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
                            onChange={(e) => {
                              setSingleTagInput(e.target.value);
                              setLinkTagInput(e.target.value);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === ",") {
                                e.preventDefault();
                                handleAddSingleTag();
                              }
                            }}
                          />
                        </div>
                        {tagsList.length > 0 && (
                          <div className="vap-suggested-tags">
                            <span className="vap-suggested-label">Available Tags:</span>
                            <div className="vap-suggested-chips">
                              {tagsList.map((t) => {
                                const isSelected = singleTags.includes(t.name);
                                return (
                                  <button
                                    type="button"
                                    key={t.id || t.name}
                                    className={`vap-tag-chip ${isSelected ? "selected" : ""}`}
                                    onClick={() => {
                                      const updated = isSelected ? singleTags.filter((s) => s !== t.name) : [...singleTags, t.name];
                                      setSingleTags(updated);
                                      setLinkTags(updated);
                                    }}
                                  >
                                    {isSelected ? "✓ " : "+ "}{t.name}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Duration / Views / Likes (Defaults to 00:00, 0, 0) */}
                    {singleSourceType !== "excel" && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                        <div className="vap-form-group">
                          <label>Duration <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 400 }}>(Default: 00:00)</span></label>
                          <input
                            type="text"
                            className="vap-input"
                            placeholder="00:00"
                            value={singleDuration}
                            onChange={(e) => {
                              setSingleDuration(e.target.value);
                              setLinkDuration(e.target.value);
                            }}
                          />
                        </div>
                        <div className="vap-form-group">
                          <label>Views <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 400 }}>(Default: 0)</span></label>
                          <input
                            type="number"
                            className="vap-input"
                            placeholder="0"
                            value={singleInitialViews}
                            onChange={(e) => {
                              setSingleInitialViews(e.target.value);
                              setLinkInitialViews(e.target.value);
                            }}
                          />
                        </div>
                        <div className="vap-form-group">
                          <label>Likes <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 400 }}>(Default: 0)</span></label>
                          <input
                            type="number"
                            className="vap-input"
                            placeholder="0"
                            value={singleInitialLikes}
                            onChange={(e) => {
                              setSingleInitialLikes(e.target.value);
                              setLinkInitialLikes(e.target.value);
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Upload Date & Time (Auto / Manual) */}
                    {singleSourceType !== "excel" && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                        <div className="vap-form-group" style={{ margin: 0 }}>
                          <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <Calendar size={14} color="#2563eb" />
                            <span>Upload Date</span>
                            <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 400 }}>(Default: Today)</span>
                          </label>
                          <input
                            type="date"
                            className="vap-input"
                            value={singleUploadDate}
                            onChange={(e) => setSingleUploadDate(e.target.value)}
                          />
                        </div>
                        <div className="vap-form-group" style={{ margin: 0 }}>
                          <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <Clock size={14} color="#2563eb" />
                            <span>Upload Time</span>
                            <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 400 }}>(Default: Current Time)</span>
                          </label>
                          <input
                            type="time"
                            step="1"
                            className="vap-input"
                            value={singleUploadTime}
                            onChange={(e) => setSingleUploadTime(e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    {/* Privacy toggle */}
                    {singleSourceType !== "excel" && (
                      <div className="vap-form-group">
                        <label>Privacy <span className="required">*</span></label>
                        <div style={{ display: "flex", gap: "10px" }}>
                          <button
                            type="button"
                            className={`vap-privacy-btn ${singlePrivacy === "public" ? "active-public" : ""}`}
                            onClick={() => {
                              setSinglePrivacy("public");
                              setLinkPrivacy("public");
                            }}
                          >
                            🌍 Public
                          </button>
                          <button
                            type="button"
                            className={`vap-privacy-btn ${singlePrivacy === "private" ? "active-private" : ""}`}
                            onClick={() => {
                              setSinglePrivacy("private");
                              setLinkPrivacy("private");
                            }}
                          >
                            🔒 Private
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Bottom Publish Button */}
                    {singleSourceType !== "excel" && (
                      <div style={{ marginTop: "20px" }}>
                        <button
                          type="button"
                          className="vap-btn-primary"
                          style={{
                            width: "100%",
                            padding: "12px 20px",
                            fontSize: "0.95rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "8px"
                          }}
                          disabled={isUploadingSingle || isFetchingMeta}
                          onClick={handleSingleUploadSubmit}
                        >
                          {isUploadingSingle ? (
                            <><Loader2 className="animate-spin" size={18} /> Uploading & Publishing...</>
                          ) : (
                            <><UploadCloud size={18} /> Publish Video</>
                          )}
                        </button>
                      </div>
                    )}

                    {/* Upload Progress Feedback */}
                    {isUploadingSingle && (
                      <div style={{ marginTop: "18px", padding: "14px 16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                          <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#1e293b", display: "flex", alignItems: "center", gap: "6px" }}>
                            <Loader2 className="animate-spin" size={15} color="#2563eb" />
                            {singleUploadStep || "Uploading & processing..."}
                          </span>
                          <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#2563eb" }}>{singleUploadProgress}%</span>
                        </div>
                        <div style={{ width: "100%", height: "8px", background: "#e2e8f0", borderRadius: "4px", overflow: "hidden" }}>
                          <div style={{ width: `${singleUploadProgress}%`, height: "100%", background: singleUploadProgress === 100 ? "#16a34a" : "linear-gradient(90deg, #2563eb, #3b82f6)", transition: "width 0.25s ease-in-out" }} />
                        </div>
                        <span style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "6px", display: "block" }}>
                          Job saved in Upload History. Check status anytime from history menu.
                        </span>
                      </div>
                    )}

                    {/* Upload Success Card */}
                    {singleUploadSuccessVideo && (
                      <div style={{ marginTop: "18px", padding: "16px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#15803d", fontWeight: 700, fontSize: "0.95rem" }}>
                          <CheckCircle2 size={20} color="#16a34a" />
                          <span>Video Published Successfully!</span>
                        </div>
                        <p style={{ margin: "6px 0 14px", fontSize: "0.85rem", color: "#374151" }}>
                          <strong>{singleUploadSuccessVideo.title}</strong> is live and available for streaming.
                        </p>
                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                          <button type="button" className="vap-btn-primary" style={{ padding: "8px 14px", fontSize: "0.83rem" }}
                            onClick={() => { if (onViewVideo) onViewVideo(singleUploadSuccessVideo); else window.open(`/?v=${singleUploadSuccessVideo.id}`, "_blank"); }}>
                            <Play size={14} /><span>Watch Live</span>
                          </button>
                          <button type="button" className="vap-btn-secondary" style={{ padding: "8px 14px", fontSize: "0.83rem" }} onClick={() => setActiveNav("history")}>
                            <History size={14} /><span>Upload History</span>
                          </button>
                          <button type="button" className="vap-btn-secondary" style={{ padding: "8px 14px", fontSize: "0.83rem" }} onClick={() => setSingleUploadSuccessVideo(null)}>
                            Upload Another
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Upload Error Alert */}
                    {singleUploadError && (
                      <div style={{ marginTop: "18px", padding: "14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#991b1b", fontWeight: 700 }}>
                          <AlertCircle size={18} color="#dc2626" />
                          <span>Upload Error</span>
                        </div>
                        <p style={{ margin: "6px 0 0", fontSize: "0.83rem", color: "#b91c1c" }}>{singleUploadError}</p>
                      </div>
                    )}
                  </div>

                </div>
              </div>

            </div>
          )}

          {/* ========================================================
              SCREEN: UPLOAD HISTORY
              ======================================================== */}
          {activeNav === "history" && (
            <div>
              <div className="vap-page-header">
                <div>
                  <h2 className="vap-page-title">Upload History</h2>
                  <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "0.85rem" }}>
                    Persistent records of all upload jobs. Check upload status, verify publishing, and open live videos anytime.
                  </p>
                </div>

                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                  {lastSkippedRows.length > 0 && (
                    <button
                      type="button"
                      className="vap-btn-secondary"
                      style={{ background: "#fef3c7", color: "#92400e", borderColor: "#fde68a", display: "inline-flex", alignItems: "center", gap: "6px" }}
                      onClick={() => handleExportSkippedExcel(lastSkippedRows)}
                      title="Download Skipped & Unpublished Videos from recent Excel import"
                    >
                      <Download size={15} />
                      <span>Skipped Videos ({lastSkippedRows.length})</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="vap-btn-primary"
                    onClick={() => setActiveNav("upload")}
                  >
                    <UploadCloud size={16} />
                    <span>Upload New Video</span>
                  </button>

                  {historyList.length > 0 && (
                    <button
                      type="button"
                      className="vap-btn-secondary"
                      onClick={() => {
                        if (window.confirm("Are you sure you want to clear upload history?")) {
                          uploadHistory.clearAll();
                          setHistoryList([]);
                          showSuccess("Upload history cleared.");
                        }
                      }}
                    >
                      <Trash2 size={15} />
                      <span>Clear History</span>
                    </button>
                  )}
                </div>
              </div>

              {/* History Summary Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", marginBottom: "20px" }}>
                <div
                  className="vap-stat-card"
                  style={{ cursor: "pointer", border: historyFilter === "all" ? "2px solid #2563eb" : undefined }}
                  onClick={() => setHistoryFilter("all")}
                >
                  <div className="vap-stat-label">Total Jobs</div>
                  <div className="vap-stat-value" style={{ fontSize: "1.6rem" }}>{historyList.length}</div>
                </div>
                <div
                  className="vap-stat-card"
                  style={{ cursor: "pointer", border: historyFilter === "published" ? "2px solid #16a34a" : undefined }}
                  onClick={() => setHistoryFilter("published")}
                >
                  <div className="vap-stat-label" style={{ color: "#16a34a" }}>Published Live</div>
                  <div className="vap-stat-value" style={{ fontSize: "1.6rem", color: "#16a34a" }}>
                    {historyList.filter((h) => h.status === "published").length}
                  </div>
                </div>
                <div
                  className="vap-stat-card"
                  style={{ cursor: "pointer", border: historyFilter === "uploading" ? "2px solid #2563eb" : undefined }}
                  onClick={() => setHistoryFilter("uploading")}
                >
                  <div className="vap-stat-label" style={{ color: "#2563eb" }}>In Progress</div>
                  <div className="vap-stat-value" style={{ fontSize: "1.6rem", color: "#2563eb" }}>
                    {historyList.filter((h) => h.status === "uploading").length}
                  </div>
                </div>
                <div
                  className="vap-stat-card"
                  style={{ cursor: "pointer", border: historyFilter === "failed" ? "2px solid #dc2626" : undefined }}
                  onClick={() => setHistoryFilter("failed")}
                >
                  <div className="vap-stat-label" style={{ color: "#dc2626" }}>Failed</div>
                  <div className="vap-stat-value" style={{ fontSize: "1.6rem", color: "#dc2626" }}>
                    {historyList.filter((h) => h.status === "failed").length}
                  </div>
                </div>
              </div>

              {/* Filter Buttons */}
              <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                {["all", "published", "uploading", "failed"].map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`vap-btn-${historyFilter === f ? "primary" : "secondary"}`}
                    style={{ fontSize: "0.82rem", textTransform: "capitalize", padding: "6px 14px" }}
                    onClick={() => setHistoryFilter(f)}
                  >
                    {f === "all" ? "All Records" : f === "published" ? "Published Live" : f === "uploading" ? "In Progress" : "Failed"}
                  </button>
                ))}
              </div>

              {/* History Table */}
              <div className="vap-card" style={{ padding: 0, overflow: "hidden" }}>
                {historyList.length === 0 ? (
                  <div style={{ padding: "60px 20px", textAlign: "center", color: "#64748b" }}>
                    <History size={48} color="#cbd5e1" style={{ margin: "0 auto 12px" }} />
                    <h3 style={{ margin: 0, color: "#1e293b" }}>No Upload History Yet</h3>
                    <p style={{ margin: "6px 0 16px", fontSize: "0.9rem" }}>
                      Upload videos via Single, Bulk, Link, or Excel to see persistent status tracking here.
                    </p>
                    <button type="button" className="vap-btn-primary" onClick={() => setActiveNav("upload")}>
                      Upload a Video Now
                    </button>
                  </div>
                ) : (
                  <div className="vap-table-responsive">
                    <table className="vap-table">
                      <thead>
                        <tr>
                          <th style={{ width: "60px" }}>Thumb</th>
                          <th>Video Title</th>
                          <th>Upload Method</th>
                          <th>File / Size</th>
                          <th>Duration</th>
                          <th>Time</th>
                          <th>Status</th>
                          <th style={{ textAlign: "right" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyList
                          .filter((item) => {
                            if (historyFilter === "all") return true;
                            return item.status === historyFilter;
                          })
                          .map((item) => (
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
                                <strong className="vap-video-title">{item.title}</strong>
                                {item.error && (
                                  <div style={{ fontSize: "0.78rem", color: "#dc2626", marginTop: "2px" }}>
                                    Error: {item.error}
                                  </div>
                                )}
                              </td>
                              <td>
                                <span className="vap-cat-pill">{item.type}</span>
                              </td>
                              <td>
                                <div
                                  style={{
                                    fontSize: "0.85rem",
                                    color: "#1e293b",
                                    maxWidth: "160px",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap"
                                  }}
                                  title={item.fileName}
                                >
                                  {item.fileName || "-"}
                                </div>
                                <span style={{ fontSize: "0.75rem", color: "#64748b" }}>{item.fileSize || ""}</span>
                              </td>
                              <td>{item.duration || "-"}</td>
                              <td style={{ fontSize: "0.8rem", color: "#64748b", whiteSpace: "nowrap" }}>
                                {item.uploadedAt}
                              </td>
                              <td>
                                {item.status === "published" && (
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "4px",
                                      color: "#16a34a",
                                      fontWeight: 600,
                                      fontSize: "0.85rem",
                                      background: "#f0fdf4",
                                      border: "1px solid #bbf7d0",
                                      padding: "3px 8px",
                                      borderRadius: "12px"
                                    }}
                                  >
                                    <CheckCircle2 size={13} color="#16a34a" /> Published
                                  </span>
                                )}
                                {item.status === "uploading" && (
                                  <div style={{ minWidth: "110px" }}>
                                    <span
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "4px",
                                        color: "#2563eb",
                                        fontWeight: 600,
                                        fontSize: "0.8rem"
                                      }}
                                    >
                                      <Loader2 className="animate-spin" size={13} /> {item.progress}%
                                    </span>
                                    <div
                                      style={{
                                        width: "100%",
                                        height: "4px",
                                        background: "#e2e8f0",
                                        borderRadius: "2px",
                                        overflow: "hidden",
                                        marginTop: "4px"
                                      }}
                                    >
                                      <div style={{ width: `${item.progress}%`, height: "100%", background: "#2563eb" }} />
                                    </div>
                                  </div>
                                )}
                                {item.status === "failed" && (
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "4px",
                                      color: "#dc2626",
                                      fontWeight: 600,
                                      fontSize: "0.85rem",
                                      background: "#fef2f2",
                                      border: "1px solid #fecaca",
                                      padding: "3px 8px",
                                      borderRadius: "12px"
                                    }}
                                  >
                                    <AlertCircle size={13} color="#dc2626" /> Failed
                                  </span>
                                )}
                              </td>
                              <td style={{ textAlign: "right" }}>
                                <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", alignItems: "center" }}>
                                  {item.status === "published" && (
                                    <button
                                      type="button"
                                      className="vap-btn-secondary"
                                      style={{ padding: "4px 8px", fontSize: "0.8rem" }}
                                      title="Open video live"
                                      onClick={() => {
                                        if (item.videoId) window.open(`/?v=${item.videoId}`, "_blank");
                                        else if (item.videoUrl) window.open(item.videoUrl, "_blank");
                                      }}
                                    >
                                      <ExternalLink size={13} />
                                      <span>Watch</span>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="vap-icon-btn danger"
                                    title="Remove from history"
                                    onClick={() => {
                                      uploadHistory.removeItem(item.id);
                                      refreshHistory();
                                    }}
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
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
                    {/* ════ LEFT COLUMN: Video Link, Video Player with Scrubber & Frame Capture, Thumbnail Link, Thumbnail Preview ════ */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>

                      {/* 1. Video Link Input */}
                      <div className="vap-form-group" style={{ margin: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                          <label style={{ margin: 0, fontWeight: 600, fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "6px" }}>
                            <LinkIcon size={15} color="#2563eb" />
                            <span>Video link</span>
                          </label>
                          {editingVideo.videoUrl && (
                            <button
                              type="button"
                              onClick={() => setEditingVideo({ ...editingVideo, videoUrl: "" })}
                              style={{ background: "none", border: "none", color: "#dc2626", fontSize: "0.78rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "3px" }}
                            >
                              <X size={12} /> Clear Link
                            </button>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <input
                            type="url"
                            className="vap-input"
                            placeholder="Paste video link (YouTube, direct MP4, M3U8, etc.)..."
                            value={editingVideo.videoUrl || ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditingVideo({ ...editingVideo, videoUrl: val });
                              setEditFile(null);
                            }}
                            style={{ flex: 1 }}
                          />
                          <button
                            type="button"
                            className="vap-fetch-btn"
                            disabled={isEditFetchingMeta || !editingVideo.videoUrl?.trim()}
                            onClick={handleEditAutoFetchMetadata}
                            title="Auto-fetch video details from this link"
                          >
                            {isEditFetchingMeta ? (
                              <><Loader2 className="animate-spin" size={14} /> Fetching...</>
                            ) : (
                              <><Zap size={14} /> Auto-Fetch</>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* 2. Video Preview & Local File Select with Scrubber and Frame Capture */}
                      <div className="vap-form-group" style={{ margin: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                          <label style={{ margin: 0, fontWeight: 600, fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "6px" }}>
                            <UploadCloud size={15} color="#2563eb" />
                            <span>Video Preview {editFile ? "(New Local File)" : (editingVideo.videoUrl ? "(Current Video)" : "")}</span>
                          </label>
                          {(editFile || editingVideo.videoUrl) && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditFile(null);
                                setEditingVideo({ ...editingVideo, videoUrl: "" });
                                if (editVideoInputRef.current) editVideoInputRef.current.value = "";
                              }}
                              style={{ background: "none", border: "none", color: "#dc2626", fontSize: "0.78rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "3px" }}
                            >
                              <Trash2 size={12} /> Clear
                            </button>
                          )}
                        </div>

                        <input
                          type="file"
                          ref={editVideoInputRef}
                          accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm,video/*"
                          style={{ display: "none" }}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setEditFile(file);
                              const meta = await detectVideoMeta(file);
                              if (meta.duration) {
                                setEditingVideo((prev) => ({
                                  ...prev,
                                  duration: meta.duration
                                }));
                              }
                            }
                          }}
                        />

                        {/* Player preview */}
                        {editFile ? (
                          /* Case A: New Local File selected */
                          <div style={{ background: "#0f172a", borderRadius: "10px", padding: "12px", border: "1.5px solid #334155" }}>
                            <video
                              ref={editVideoPlayerRef}
                              src={URL.createObjectURL(editFile)}
                              controls
                              crossOrigin="anonymous"
                              style={{ width: "100%", maxHeight: "200px", borderRadius: "6px", background: "#000", display: "block" }}
                              onLoadedMetadata={(e) => {
                                const d = e.target.duration || 0;
                                setEditVideoDurationSecs(d);
                                if (!editingVideo.duration || editingVideo.duration === "00:00") {
                                  setEditingVideo((prev) => ({ ...prev, duration: formatSecsToTime(d) }));
                                }
                              }}
                              onTimeUpdate={(e) => setEditCurrentScrubTime(e.target.currentTime)}
                            />
                            <div style={{ marginTop: "8px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.82rem" }}>
                              <span style={{ color: "#22c55e", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>
                                ✓ New Local File: {editFile.name}
                              </span>
                              <span style={{ color: "#94a3b8" }}>
                                {(editFile.size / (1024 * 1024)).toFixed(1)} MB {editVideoDurationSecs ? `| ${formatSecsToTime(editVideoDurationSecs)}` : ""}
                              </span>
                            </div>

                            {/* Timeline scrubber */}
                            <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #1e293b" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                                <span style={{ color: "#cbd5e1", fontSize: "0.78rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "5px" }}>
                                  <Film size={13} color="#38bdf8" /> Video Timeline Scrubber:
                                </span>
                                <span style={{ color: "#38bdf8", fontSize: "0.78rem", fontFamily: "monospace", fontWeight: 700 }}>
                                  {formatSecsToTime(editCurrentScrubTime)} / {formatSecsToTime(editVideoDurationSecs)}
                                </span>
                              </div>

                              <input
                                type="range"
                                min={0}
                                max={editVideoDurationSecs || 100}
                                step={0.1}
                                value={editCurrentScrubTime}
                                onChange={(e) => {
                                  const t = parseFloat(e.target.value) || 0;
                                  setEditCurrentScrubTime(t);
                                  if (editVideoPlayerRef.current) editVideoPlayerRef.current.currentTime = t;
                                }}
                                style={{ width: "100%", accentColor: "#2563eb", cursor: "pointer", height: "6px" }}
                              />

                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px", gap: "6px", flexWrap: "wrap" }}>
                                <div style={{ display: "flex", gap: "4px" }}>
                                  {[
                                    { label: "0s", time: 0 },
                                    { label: "5s", time: 5 },
                                    { label: "15s", time: 15 },
                                    { label: "30s", time: 30 },
                                    { label: "Mid", time: editVideoDurationSecs ? editVideoDurationSecs / 2 : 10 },
                                  ].map((btn, idx) => (
                                    <button
                                      key={idx}
                                      type="button"
                                      onClick={() => {
                                        const t = Math.min(btn.time, editVideoDurationSecs || btn.time);
                                        setEditCurrentScrubTime(t);
                                        if (editVideoPlayerRef.current) editVideoPlayerRef.current.currentTime = t;
                                      }}
                                      style={{ background: "#1e293b", border: "1px solid #475569", color: "#e2e8f0", fontSize: "0.72rem", padding: "3px 7px", borderRadius: "4px", cursor: "pointer" }}
                                    >
                                      {btn.label}
                                    </button>
                                  ))}
                                </div>

                                <button
                                  type="button"
                                  onClick={handleCaptureEditVideoFrame}
                                  style={{ background: "#2563eb", color: "#ffffff", border: "none", borderRadius: "5px", padding: "5px 10px", fontSize: "0.78rem", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "5px", cursor: "pointer" }}
                                  title="Capture frame at current video time as thumbnail"
                                >
                                  <Camera size={13} />
                                  <span>Capture Frame as Thumbnail</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : editingVideo.videoUrl ? (
                          /* Case B: Existing or New Video URL (YouTube or Direct Video) */
                          (() => {
                            const ytMatch = editingVideo.videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
                            const ytId = ytMatch ? ytMatch[1] : null;

                            return (
                              <div style={{ background: "#0f172a", borderRadius: "10px", padding: "12px", border: "1.5px solid #334155" }}>
                                {ytId ? (
                                  <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", maxHeight: "200px", borderRadius: "6px", overflow: "hidden", background: "#000" }}>
                                    <iframe
                                      src={`https://www.youtube.com/embed/${ytId}`}
                                      title="YouTube Preview"
                                      style={{ width: "100%", height: "100%", border: "none" }}
                                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                      allowFullScreen
                                    />
                                  </div>
                                ) : (
                                  <video
                                    ref={editVideoPlayerRef}
                                    src={cleanVideoUrl(editingVideo.videoUrl)}
                                    controls
                                    crossOrigin="anonymous"
                                    style={{ width: "100%", maxHeight: "200px", borderRadius: "6px", background: "#000", display: "block" }}
                                    onLoadedMetadata={(e) => {
                                      const d = e.target.duration || 0;
                                      setEditVideoDurationSecs(d);
                                      if (!editingVideo.duration || editingVideo.duration === "00:00") {
                                        setEditingVideo((prev) => ({ ...prev, duration: formatSecsToTime(d) }));
                                      }
                                    }}
                                    onTimeUpdate={(e) => setEditCurrentScrubTime(e.target.currentTime)}
                                  />
                                )}

                                <div style={{ marginTop: "8px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.82rem" }}>
                                  <span style={{ color: "#22c55e", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "65%" }}>
                                    ✓ Video Source: {ytId ? `YouTube (${ytId})` : cleanDisplayTitle(editingVideo.videoUrl)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => editVideoInputRef.current?.click()}
                                    style={{ background: "#1e293b", border: "1px solid #475569", color: "#93c5fd", borderRadius: "4px", padding: "3px 8px", fontSize: "0.74rem", cursor: "pointer" }}
                                  >
                                    Replace with Local File
                                  </button>
                                </div>

                                {/* Timeline Frame Scrubber for direct video URLs */}
                                {!ytId && (
                                  <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #1e293b" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                                      <span style={{ color: "#cbd5e1", fontSize: "0.78rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "5px" }}>
                                        <Film size={13} color="#38bdf8" /> Video Timeline Scrubber:
                                      </span>
                                      <span style={{ color: "#38bdf8", fontSize: "0.78rem", fontFamily: "monospace", fontWeight: 700 }}>
                                        {formatSecsToTime(editCurrentScrubTime)} / {formatSecsToTime(editVideoDurationSecs)}
                                      </span>
                                    </div>

                                    <input
                                      type="range"
                                      min={0}
                                      max={editVideoDurationSecs || 100}
                                      step={0.1}
                                      value={editCurrentScrubTime}
                                      onChange={(e) => {
                                        const t = parseFloat(e.target.value) || 0;
                                        setEditCurrentScrubTime(t);
                                        if (editVideoPlayerRef.current) editVideoPlayerRef.current.currentTime = t;
                                      }}
                                      style={{ width: "100%", accentColor: "#2563eb", cursor: "pointer", height: "6px" }}
                                    />

                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px", gap: "6px", flexWrap: "wrap" }}>
                                      <div style={{ display: "flex", gap: "4px" }}>
                                        {[
                                          { label: "0s", time: 0 },
                                          { label: "5s", time: 5 },
                                          { label: "15s", time: 15 },
                                          { label: "30s", time: 30 },
                                          { label: "Mid", time: editVideoDurationSecs ? editVideoDurationSecs / 2 : 10 },
                                        ].map((btn, idx) => (
                                          <button
                                            key={idx}
                                            type="button"
                                            onClick={() => {
                                              const t = Math.min(btn.time, editVideoDurationSecs || btn.time);
                                              setEditCurrentScrubTime(t);
                                              if (editVideoPlayerRef.current) editVideoPlayerRef.current.currentTime = t;
                                            }}
                                            style={{ background: "#1e293b", border: "1px solid #475569", color: "#e2e8f0", fontSize: "0.72rem", padding: "3px 7px", borderRadius: "4px", cursor: "pointer" }}
                                          >
                                            {btn.label}
                                          </button>
                                        ))}
                                      </div>

                                      <button
                                        type="button"
                                        onClick={handleCaptureEditVideoFrame}
                                        style={{ background: "#2563eb", color: "#ffffff", border: "none", borderRadius: "5px", padding: "5px 10px", fontSize: "0.78rem", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "5px", cursor: "pointer" }}
                                        title="Capture frame at current video time as thumbnail"
                                      >
                                        <Camera size={13} />
                                        <span>Capture Frame as Thumbnail</span>
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()
                        ) : (
                          /* Case C: No video - Dropzone */
                          <div
                            className="vap-dropzone"
                            onClick={() => editVideoInputRef.current?.click()}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (e.dataTransfer.files?.[0]) {
                                setEditFile(e.dataTransfer.files[0]);
                              }
                            }}
                            style={{ padding: "20px 14px", minHeight: "110px", cursor: "pointer" }}
                          >
                            <div className="vap-dropzone-icon" style={{ marginBottom: "6px" }}><UploadCloud size={24} /></div>
                            <div className="vap-dropzone-prompt" style={{ fontSize: "0.88rem" }}>
                              Choose Local Video File or Drag & Drop Here
                            </div>
                            <span className="vap-dropzone-sub" style={{ fontSize: "0.76rem", marginTop: "4px" }}>
                              MP4, MOV, MKV, WEBM (Or paste video link in the box above)
                            </span>
                          </div>
                        )}
                      </div>

                      {/* 3. Thumbnail Link Input */}
                      <div className="vap-form-group" style={{ margin: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                          <label style={{ margin: 0, fontWeight: 600, fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "6px" }}>
                            <LinkIcon size={15} color="#16a34a" />
                            <span>Thumbnail link</span>
                          </label>
                          {editingVideo.thumbnail && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingVideo({ ...editingVideo, thumbnail: "" });
                                setEditThumbnailFile(null);
                              }}
                              style={{ background: "none", border: "none", color: "#dc2626", fontSize: "0.78rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "3px" }}
                            >
                              <X size={12} /> Clear
                            </button>
                          )}
                        </div>
                        <input
                          type="url"
                          className="vap-input"
                          placeholder="Paste Thumbnail image URL (https://...jpg, png, webp)"
                          value={editingVideo.thumbnail || ""}
                          onChange={(e) => {
                            setEditingVideo({ ...editingVideo, thumbnail: e.target.value });
                            setEditThumbnailFile(null);
                          }}
                        />
                      </div>

                      {/* 4. Local Thumbnail Select & Large 16:9 Preview */}
                      <div className="vap-form-group" style={{ margin: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                          <label style={{ margin: 0, fontWeight: 600, fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "6px" }}>
                            <Film size={15} color="#16a34a" />
                            <span>Thumbnail preview & change</span>
                          </label>
                          {editingVideo.thumbnail && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingVideo({ ...editingVideo, thumbnail: "" });
                                setEditThumbnailFile(null);
                                if (editThumbInputRef.current) editThumbInputRef.current.value = "";
                              }}
                              style={{ background: "none", border: "none", color: "#dc2626", fontSize: "0.78rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "3px" }}
                            >
                              <Trash2 size={12} /> Remove Thumbnail
                            </button>
                          )}
                        </div>

                        <input
                          type="file"
                          ref={editThumbInputRef}
                          accept="image/jpeg,image/png,image/webp"
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

                        <div
                          style={{
                            width: "100%",
                            aspectRatio: "16 / 9",
                            maxHeight: "180px",
                            borderRadius: "10px",
                            background: "#0f172a",
                            border: "2px dashed #334155",
                            overflow: "hidden",
                            position: "relative",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer"
                          }}
                          onClick={() => editThumbInputRef.current?.click()}
                          title="Click to choose new local thumbnail image"
                        >
                          {editingVideo.thumbnail ? (
                            <img
                              src={editingVideo.thumbnail}
                              alt="Thumbnail Preview"
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              onError={(e) => { e.currentTarget.src = FALLBACK_THUMBNAIL; }}
                            />
                          ) : (
                            <div style={{ textAlign: "center", color: "#94a3b8", padding: "16px" }}>
                              <Film size={28} style={{ margin: "0 auto 6px", opacity: 0.8 }} />
                              <div style={{ fontSize: "0.84rem", fontWeight: 500 }}>Click to Choose Local Thumbnail Image</div>
                              <div style={{ fontSize: "0.74rem", color: "#64748b", marginTop: "2px" }}>PNG, JPG, WEBP (16:9 Recommended)</div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Live Website URL Box */}
                      <div style={{ padding: "12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
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

                    </div>

                    {/* ════ RIGHT COLUMN: Title, Description, Category, Tags, Duration, Views, Likes, Privacy ════ */}
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
                        {tagsList.length > 0 && (
                          <div className="vap-suggested-tags">
                            <span className="vap-suggested-label">Available Tags (click to toggle):</span>
                            <div className="vap-suggested-chips">
                              {tagsList.map((t) => {
                                const isSelected = (editingVideo.tags || []).includes(t.name);
                                return (
                                  <button
                                    type="button"
                                    key={t.id || t.name}
                                    className={`vap-tag-chip ${isSelected ? "selected" : ""}`}
                                    onClick={() => {
                                      if (isSelected) {
                                        setEditingVideo({
                                          ...editingVideo,
                                          tags: (editingVideo.tags || []).filter((tg) => tg !== t.name)
                                        });
                                      } else {
                                        setEditingVideo({
                                          ...editingVideo,
                                          tags: [...(editingVideo.tags || []), t.name]
                                        });
                                      }
                                    }}
                                  >
                                    {isSelected ? "✓ " : "+ "}{t.name}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Duration / Views / Likes (Keeps existing views/likes, never auto-resets to 0) */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                        <div className="vap-form-group">
                          <label>Duration <span style={{ fontSize: "0.74rem", color: "#64748b" }}>(Auto / Manual)</span></label>
                          <input
                            type="text"
                            className="vap-input"
                            value={editingVideo.duration || ""}
                            placeholder="00:00"
                            onChange={(e) => setEditingVideo({ ...editingVideo, duration: e.target.value })}
                          />
                        </div>

                        <div className="vap-form-group">
                          <label>Views <span style={{ fontSize: "0.74rem", color: "#64748b" }}>(Current: {editingVideo.views ?? 0})</span></label>
                          <input
                            type="number"
                            className="vap-input"
                            value={editingVideo.views !== undefined ? editingVideo.views : (editingVideo.initial_views !== undefined ? editingVideo.initial_views : 0)}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10) || 0;
                              setEditingVideo({ ...editingVideo, views: v, initial_views: v });
                            }}
                          />
                        </div>

                        <div className="vap-form-group">
                          <label>Likes <span style={{ fontSize: "0.74rem", color: "#64748b" }}>(Current: {editingVideo.likes ?? 0})</span></label>
                          <input
                            type="number"
                            className="vap-input"
                            value={editingVideo.likes !== undefined ? editingVideo.likes : (editingVideo.initial_likes !== undefined ? editingVideo.initial_likes : 0)}
                            onChange={(e) => {
                              const l = parseInt(e.target.value, 10) || 0;
                              setEditingVideo({ ...editingVideo, likes: l, initial_likes: l });
                            }}
                          />
                        </div>
                      </div>

                      {/* Upload Date & Time (Edit) */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                        <div className="vap-form-group" style={{ margin: 0 }}>
                          <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <Calendar size={14} color="#2563eb" />
                            <span>Upload Date</span>
                            <span style={{ fontSize: "0.74rem", color: "#64748b" }}>(DD/MM/YYYY)</span>
                          </label>
                          <input
                            type="date"
                            className="vap-input"
                            value={editUploadDate}
                            onChange={(e) => setEditUploadDate(e.target.value)}
                          />
                        </div>
                        <div className="vap-form-group" style={{ margin: 0 }}>
                          <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <Clock size={14} color="#2563eb" />
                            <span>Upload Time</span>
                            <span style={{ fontSize: "0.74rem", color: "#64748b" }}>(HH:MM:SS)</span>
                          </label>
                          <input
                            type="time"
                            step="1"
                            className="vap-input"
                            value={editUploadTime}
                            onChange={(e) => setEditUploadTime(e.target.value)}
                          />
                        </div>
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

                      {/* Action Buttons: Delete Video & Save Changes */}
                      <div style={{ marginTop: "24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                        <button
                          type="button"
                          className="vap-btn-danger-outline"
                          onClick={() => handleDeleteVideoConfirm(editingVideo)}
                        >
                          <Trash2 size={16} />
                          <span>Delete Video</span>
                        </button>

                        <div style={{ display: "flex", gap: "10px" }}>
                          <button
                            type="button"
                            className="vap-btn-secondary"
                            onClick={() => setActiveNav("videos")}
                          >
                            Cancel
                          </button>
                          <button type="submit" className="vap-btn-primary" disabled={isUpdating}>
                            {isUpdating ? "Saving changes..." : "Update Video"}
                          </button>
                        </div>
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

          {/* ========================================================
              SCREEN 6: TAGS
              ======================================================== */}
          {activeNav === "tags" && (
            <div>
              <div className="vap-page-header">
                <h2 className="vap-page-title">Tags Management</h2>
              </div>

              {/* Add Tag Form */}
              <div className="vap-card" style={{ marginBottom: "20px" }}>
                <form onSubmit={handleAddTag} style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
                  <div className="vap-form-group" style={{ flex: 1, margin: 0 }}>
                    <label>New Tag Name</label>
                    <input
                      type="text"
                      className="vap-input"
                      placeholder="e.g. Desi, Trending, Romance, Bhabhi, MMS"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                    />
                  </div>
                  <button type="submit" className="vap-btn-primary">
                    <Plus size={16} />
                    <span>Add Tag</span>
                  </button>
                </form>
              </div>

              {/* Tags List */}
              <div className="vap-card">
                <div className="vap-table-container">
                  <table className="vap-table">
                    <thead>
                      <tr>
                        <th>Tag Name</th>
                        <th>Slug</th>
                        <th>Videos Count</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tagsList.length === 0 ? (
                        <tr>
                          <td colSpan="4" style={{ textAlign: "center", padding: "30px", color: "#64748b" }}>
                            No tags added yet. Create your first tag above.
                          </td>
                        </tr>
                      ) : (
                        tagsList.map((tag) => (
                          <tr key={tag.id || tag.name}>
                            <td>
                              {editingTagId === tag.id ? (
                                <input
                                  type="text"
                                  className="vap-input"
                                  value={editingTagName}
                                  onChange={(e) => setEditingTagName(e.target.value)}
                                  autoFocus
                                />
                              ) : (
                                <strong>#{tag.name}</strong>
                              )}
                            </td>
                            <td>
                              <span style={{ color: "#64748b" }}>{tag.slug || tag.name.toLowerCase()}</span>
                            </td>
                            <td>
                              <span className="vap-tag-pill">{tag.count || 0} videos</span>
                            </td>
                            <td>
                              <div className="vap-actions-cell">
                                {editingTagId === tag.id ? (
                                  <>
                                    <button
                                      className="vap-icon-btn"
                                      onClick={() => handleUpdateTag(tag.id)}
                                      title="Save tag"
                                    >
                                      <Check size={15} color="#16a34a" />
                                    </button>
                                    <button
                                      className="vap-icon-btn"
                                      onClick={() => setEditingTagId(null)}
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
                                        setEditingTagId(tag.id);
                                        setEditingTagName(tag.name);
                                      }}
                                      title="Edit tag"
                                    >
                                      <Pencil size={15} />
                                    </button>
                                    <button
                                      className="vap-icon-btn danger"
                                      onClick={() => handleDeleteTag(tag)}
                                      title="Delete tag"
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================
              SCREEN 7: EXPORT DATA
              ======================================================== */}
          {activeNav === "export" && (
            <div>
              <div className="vap-page-header">
                <div>
                  <h2 className="vap-page-title">Export Videos & Data</h2>
                  <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "0.85rem" }}>
                    Export your complete video database to .xlsx Excel format with custom date, category, and storage filters.
                  </p>
                </div>
              </div>

              {/* Main Export Card */}
              <div className="vap-card" style={{ marginBottom: "20px" }}>
                <h3 style={{ margin: "0 0 16px", fontSize: "1.05rem", fontWeight: 700 }}>
                  1. Filter Videos to Export
                </h3>

                {/* Storage Quick Presets */}
                <div className="vap-export-presets" style={{ marginBottom: "16px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className={`vap-export-preset-btn ${exportIncludeStorage && exportIncludeLinks ? "active" : ""}`}
                    onClick={() => {
                      setExportIncludeStorage(true);
                      setExportIncludeLinks(true);
                    }}
                  >
                    ✓ Sabhi Videos (All: {allCurrentList.length})
                  </button>
                  <button
                    type="button"
                    className={`vap-export-preset-btn ${exportIncludeStorage && !exportIncludeLinks ? "active" : ""}`}
                    onClick={() => {
                      setExportIncludeStorage(true);
                      setExportIncludeLinks(false);
                    }}
                  >
                    ☁️ Our Server Only (R2) ({ourServerOnlyCount})
                  </button>
                  <button
                    type="button"
                    className={`vap-export-preset-btn ${!exportIncludeStorage && exportIncludeLinks ? "active" : ""}`}
                    onClick={() => {
                      setExportIncludeStorage(false);
                      setExportIncludeLinks(true);
                    }}
                  >
                    🔗 Other Person Storage (Other PS) ({otherPsOnlyCount})
                  </button>
                </div>

                {/* Date Filter Modes */}
                <div style={{ marginTop: "16px" }}>
                  <label style={{ fontWeight: 600, fontSize: "0.88rem", display: "block", marginBottom: "8px" }}>
                    Date Filter
                  </label>
                  <div className="vap-export-mode-presets" style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
                    {[
                      { id: "all", label: "All Time" },
                      { id: "today", label: "Today" },
                      { id: "last7", label: "Last 7 Days" },
                      { id: "last30", label: "Last 30 Days" },
                      { id: "upto", label: "Up To Date" },
                      { id: "range", label: "Custom Date Range" }
                    ].map((m) => (
                      <button
                        type="button"
                        key={m.id}
                        className={`vap-export-mode-btn ${exportDateMode === m.id ? "active" : ""}`}
                        onClick={() => setExportDateMode(m.id)}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {/* Date Input Pickers */}
                  {(exportDateMode === "upto" || exportDateMode === "range") && (
                    <div className="vap-export-inputs-grid" style={{ display: "flex", gap: "12px", marginBottom: "14px", flexWrap: "wrap" }}>
                      {exportDateMode === "range" && (
                        <div className="vap-export-input-group" style={{ flex: 1, minWidth: "160px" }}>
                          <label style={{ fontSize: "0.82rem", fontWeight: 600 }}>Start Date</label>
                          <input
                            type="date"
                            className="vap-input"
                            value={exportStartDate}
                            onChange={(e) => setExportStartDate(e.target.value)}
                          />
                        </div>
                      )}
                      <div className="vap-export-input-group" style={{ flex: 1, minWidth: "160px" }}>
                        <label style={{ fontSize: "0.82rem", fontWeight: 600 }}>End Date</label>
                        <input
                          type="date"
                          className="vap-input"
                          value={exportEndDate}
                          onChange={(e) => setExportEndDate(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Category & Privacy Filters */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginTop: "10px" }}>
                  <div className="vap-form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: "0.82rem", fontWeight: 600 }}>Filter by Category</label>
                    <select
                      className="vap-form-select"
                      value={exportCategoryFilter}
                      onChange={(e) => setExportCategoryFilter(e.target.value)}
                    >
                      <option value="all">All Categories</option>
                      {categoriesList.map((c) => (
                        <option key={c.id || c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="vap-form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: "0.82rem", fontWeight: 600 }}>Filter by Privacy</label>
                    <select
                      className="vap-form-select"
                      value={exportPrivacyFilter}
                      onChange={(e) => setExportPrivacyFilter(e.target.value)}
                    >
                      <option value="all">All (Public & Private)</option>
                      <option value="public">Public Videos Only</option>
                      <option value="private">Private Videos Only</option>
                    </select>
                  </div>
                </div>

                {/* Format Columns Preview */}
                <div className="vap-export-format-preview" style={{ marginTop: "18px" }}>
                  <div><strong>Standard Columns in Exported Excel:</strong></div>
                  <div className="vap-export-cols-tags">
                    {["Video URL", "Thumbnail URL", "Title", "Description", "Category", "Tags", "Duration", "Initial Views", "Initial Likes", "Privacy", "Upload Date", "Upload Time"].map((col) => (
                      <span key={col} className="vap-export-col-tag">{col}</span>
                    ))}
                  </div>
                </div>

                {/* Export Action Card */}
                <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "14px" }}>
                  <div>
                    <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "#1e293b" }}>
                      Ready to Export: <span style={{ color: "#16a34a" }}>{getFilteredExportVideos().length} Videos</span>
                    </span>
                    <span style={{ display: "block", fontSize: "0.78rem", color: "#64748b", marginTop: "2px" }}>
                      Instant download matching your selection (.xlsx format)
                    </span>
                  </div>

                  <button
                    type="button"
                    className="vap-btn-primary"
                    onClick={handleExecuteExcelExport}
                    disabled={isExporting || getFilteredExportVideos().length === 0}
                    style={{
                      background: "#16a34a",
                      padding: "12px 28px",
                      fontSize: "0.95rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px"
                    }}
                  >
                    {isExporting ? (
                      <><Loader2 className="animate-spin" size={16} /> Generating Excel...</>
                    ) : (
                      <><Download size={16} /> Download Excel (.xlsx)</>
                    )}
                  </button>
                </div>
              </div>

              {/* Sample Template Download */}
              <div className="vap-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                  <div>
                    <h4 style={{ margin: "0 0 4px", fontSize: "0.95rem", fontWeight: 700 }}>Excel Import Template</h4>
                    <p style={{ margin: 0, fontSize: "0.82rem", color: "#64748b" }}>
                      Download the official blank Excel template to bulk upload multiple videos at once.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="vap-btn-secondary"
                    onClick={handleDownloadExcelTemplate}
                    style={{ fontSize: "0.85rem", padding: "8px 16px", display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    <Download size={15} /> Download Sample Template (.xlsx)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================
              SCREEN 8: OTHER PERSON STORAGE (OTHER PS)
              ======================================================== */}
          {activeNav === "other_ps" && (
            <div>
              {/* Header */}
              <div className="vap-page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "14px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(59, 130, 246, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#3b82f6" }}>
                      <HardDrive size={22} />
                    </div>
                    <div>
                      <h2 className="vap-page-title" style={{ margin: 0 }}>Other Person Storage (Other PS)</h2>
                      <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "0.85rem" }}>
                        Manage external & friend videos. Sync to Cloudflare R2 (Primary URL) to protect against dead links, or toggle active streaming source in 1 click.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Quick 1-Click Action Buttons */}
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="vap-btn-primary"
                    disabled={isSyncingStorage || pendingOtherPsCount === 0}
                    onClick={() => {
                      const pending = otherPsList.filter((v) => !isOtherPsSynced(v));
                      handleSyncOtherPsVideos(pending.map((v) => v.id));
                    }}
                    style={{ background: "#16a34a", padding: "9px 16px", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "6px" }}
                    title="Sync all unsynced videos to Cloudflare R2 in 1 click"
                  >
                    <Zap size={15} />
                    <span>Sync All Pending ({pendingOtherPsCount})</span>
                  </button>

                  <button
                    type="button"
                    className="vap-btn-secondary"
                    disabled={isSwitchingSource || syncedOtherPsCount === 0}
                    onClick={() => handleSwitchOtherPsSource(null, "our_server", true)}
                    style={{ padding: "9px 14px", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "6px" }}
                    title="Stream all eligible synced videos from Our Server (Fast & Reliable)"
                  >
                    <Server size={15} />
                    <span>Stream All from Our Server</span>
                  </button>

                  <button
                    type="button"
                    className="vap-btn-secondary"
                    disabled={isSwitchingSource}
                    onClick={() => handleSwitchOtherPsSource(null, "other_ps", true)}
                    style={{ padding: "9px 14px", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "6px" }}
                    title="Stream all videos from Friend's Server (Saves R2 bandwidth)"
                  >
                    <LinkIcon size={15} />
                    <span>Stream All from Other PS</span>
                  </button>
                </div>
              </div>

              {/* In-Flight Sync Banner */}
              {isSyncingStorage && (
                <div className="vap-card" style={{ marginBottom: "18px", border: "1px solid #3b82f6", background: "rgba(59, 130, 246, 0.05)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <Loader2 className="animate-spin" size={18} style={{ color: "#3b82f6" }} />
                      <span style={{ fontWeight: 600, fontSize: "0.92rem", color: "#1e293b" }}>{syncStepText}</span>
                    </div>
                    <span style={{ fontWeight: 700, fontSize: "0.92rem", color: "#3b82f6" }}>{syncProgress}%</span>
                  </div>
                  <div style={{ width: "100%", height: "8px", background: "#e2e8f0", borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{ width: `${syncProgress}%`, height: "100%", background: "linear-gradient(90deg, #3b82f6, #10b981)", transition: "width 0.3s ease" }} />
                  </div>
                </div>
              )}

              {/* 4 Stat Cards */}
              <div className="vap-stats-grid" style={{ marginBottom: "20px" }}>
                {/* 1. Total Other PS */}
                <div className="vap-stat-card">
                  <div className="vap-stat-icon" style={{ background: "rgba(59, 130, 246, 0.12)", color: "#3b82f6" }}>
                    <HardDrive size={22} />
                  </div>
                  <div className="vap-stat-info">
                    <span className="vap-stat-label">Total Other PS Videos</span>
                    <span className="vap-stat-value">{totalOtherPsCount}</span>
                    <span style={{ fontSize: "0.75rem", color: "#64748b" }}>External / friend links</span>
                  </div>
                </div>

                {/* 2. Synced in R2 */}
                <div className="vap-stat-card">
                  <div className="vap-stat-icon" style={{ background: "rgba(22, 163, 74, 0.12)", color: "#16a34a" }}>
                    <CheckCircle2 size={22} />
                  </div>
                  <div className="vap-stat-info">
                    <span className="vap-stat-label">Synced in Our Server (R2)</span>
                    <span className="vap-stat-value" style={{ color: "#16a34a" }}>{syncedOtherPsCount}</span>
                    <span style={{ fontSize: "0.75rem", color: "#16a34a", fontWeight: 600 }}>
                      {Math.round((syncedOtherPsCount / (totalOtherPsCount || 1)) * 100)}% Safe & Protected
                    </span>
                  </div>
                </div>

                {/* 3. Pending Sync */}
                <div className="vap-stat-card">
                  <div className="vap-stat-icon" style={{ background: "rgba(245, 158, 11, 0.12)", color: "#f59e0b" }}>
                    <AlertCircle size={22} />
                  </div>
                  <div className="vap-stat-info">
                    <span className="vap-stat-label">Pending Sync (Friend Only)</span>
                    <span className="vap-stat-value" style={{ color: pendingOtherPsCount > 0 ? "#f59e0b" : "#64748b" }}>
                      {pendingOtherPsCount}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      {pendingOtherPsCount > 0 ? "⚠️ At risk if friend link dies" : "✓ All synced!"}
                    </span>
                  </div>
                </div>

                {/* 4. Active Source Split */}
                <div className="vap-stat-card">
                  <div className="vap-stat-icon" style={{ background: "rgba(139, 92, 246, 0.12)", color: "#8b5cf6" }}>
                    <Server size={22} />
                  </div>
                  <div className="vap-stat-info">
                    <span className="vap-stat-label">Active Stream Source</span>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "2px" }}>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#2563eb" }}>☁️ {ourServerStreamCount} Our</span>
                      <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>|</span>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#7c3aed" }}>🔗 {otherPsStreamCount} Other</span>
                    </div>
                    <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Live streaming split</span>
                  </div>
                </div>
              </div>

              {/* Main Card with Controls and Table */}
              <div className="vap-card">
                {/* Filter Tabs and Search Bar */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
                  {/* Filter Pills */}
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {[
                      { id: "all", label: `Sabhi Other PS (${totalOtherPsCount})` },
                      { id: "pending", label: `⚠️ Pending Sync (${pendingOtherPsCount})`, warn: pendingOtherPsCount > 0 },
                      { id: "synced", label: `✓ Synced in R2 (${syncedOtherPsCount})` },
                      { id: "active_our_server", label: `☁️ Streaming Our Server (${ourServerStreamCount})` },
                      { id: "active_other_ps", label: `🔗 Streaming Other PS (${otherPsStreamCount})` }
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setOtherPsFilter(tab.id)}
                        className={`vap-filter-tab-btn ${otherPsFilter === tab.id ? "active" : ""}`}
                        style={{
                          padding: "6px 14px",
                          borderRadius: "20px",
                          fontSize: "0.82rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          border: otherPsFilter === tab.id ? "1px solid #2563eb" : "1px solid #e2e8f0",
                          background: otherPsFilter === tab.id ? "#2563eb" : "#f8fafc",
                          color: otherPsFilter === tab.id ? "#ffffff" : (tab.warn ? "#d97706" : "#475569"),
                          transition: "all 0.18s ease"
                        }}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Search box */}
                  <div style={{ position: "relative", minWidth: "220px" }}>
                    <Search size={15} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
                    <input
                      type="text"
                      className="vap-input"
                      placeholder="Search title, category..."
                      value={otherPsSearch}
                      onChange={(e) => setOtherPsSearch(e.target.value)}
                      style={{ paddingLeft: "32px", fontSize: "0.83rem", height: "36px" }}
                    />
                  </div>
                </div>

                {/* Quick Selection Toolbar (Counting Wise & Date Wise) */}
                <div style={{ background: "#f8fafc", padding: "12px 14px", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                  {/* Counting Selection Buttons */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#475569" }}>Quick Select:</span>
                    <button
                      type="button"
                      onClick={() => handleSelectCount(10)}
                      className="vap-btn-secondary"
                      style={{ padding: "4px 10px", fontSize: "0.78rem", borderRadius: "6px" }}
                    >
                      First 10
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectCount(25)}
                      className="vap-btn-secondary"
                      style={{ padding: "4px 10px", fontSize: "0.78rem", borderRadius: "6px" }}
                    >
                      First 25
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectCount(50)}
                      className="vap-btn-secondary"
                      style={{ padding: "4px 10px", fontSize: "0.78rem", borderRadius: "6px" }}
                    >
                      First 50
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectAllPending}
                      className="vap-btn-secondary"
                      style={{ padding: "4px 10px", fontSize: "0.78rem", borderRadius: "6px", color: "#d97706", borderColor: "#fde68a" }}
                    >
                      All Pending ({pendingOtherPsCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedOtherPsIds(getFilteredOtherPsVideos().map((v) => v.id))}
                      className="vap-btn-secondary"
                      style={{ padding: "4px 10px", fontSize: "0.78rem", borderRadius: "6px" }}
                    >
                      Select All Visible ({getFilteredOtherPsVideos().length})
                    </button>
                    {selectedOtherPsIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedOtherPsIds([])}
                        className="vap-btn-secondary"
                        style={{ padding: "4px 10px", fontSize: "0.78rem", borderRadius: "6px", color: "#ef4444" }}
                      >
                        Clear Selection
                      </button>
                    )}
                  </div>

                  {/* Date Range Selection */}
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                    <Calendar size={14} style={{ color: "#64748b" }} />
                    <input
                      type="date"
                      value={otherPsStartDate}
                      onChange={(e) => setOtherPsStartDate(e.target.value)}
                      style={{ padding: "4px 8px", fontSize: "0.78rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                    />
                    <span style={{ fontSize: "0.78rem", color: "#64748b" }}>to</span>
                    <input
                      type="date"
                      value={otherPsEndDate}
                      onChange={(e) => setOtherPsEndDate(e.target.value)}
                      style={{ padding: "4px 8px", fontSize: "0.78rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                    />
                    {(otherPsStartDate || otherPsEndDate) && (
                      <button
                        type="button"
                        onClick={() => {
                          setOtherPsStartDate("");
                          setOtherPsEndDate("");
                        }}
                        style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "0.78rem" }}
                      >
                        Reset Date
                      </button>
                    )}
                  </div>
                </div>

                {/* Bulk Actions Bar when items selected */}
                {selectedOtherPsIds.length > 0 && (
                  <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: "10px 16px", borderRadius: "8px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <CheckCircle2 size={18} style={{ color: "#2563eb" }} />
                      <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "#1e3a8a" }}>
                        {selectedOtherPsIds.length} video(s) selected
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="vap-btn-primary"
                        onClick={() => handleSyncOtherPsVideos(selectedOtherPsIds)}
                        disabled={isSyncingStorage}
                        style={{ background: "#16a34a", padding: "6px 14px", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "6px" }}
                      >
                        <Zap size={14} />
                        <span>Sync Selected to Our Storage ({selectedOtherPsIds.length})</span>
                      </button>

                      <button
                        type="button"
                        className="vap-btn-secondary"
                        onClick={() => handleSwitchOtherPsSource(selectedOtherPsIds, "our_server")}
                        disabled={isSwitchingSource}
                        style={{ padding: "6px 14px", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "6px" }}
                      >
                        <Server size={14} />
                        <span>Stream from Our Server ({selectedOtherPsIds.length})</span>
                      </button>

                      <button
                        type="button"
                        className="vap-btn-secondary"
                        onClick={() => handleSwitchOtherPsSource(selectedOtherPsIds, "other_ps")}
                        disabled={isSwitchingSource}
                        style={{ padding: "6px 14px", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "6px" }}
                      >
                        <LinkIcon size={14} />
                        <span>Stream from Other PS ({selectedOtherPsIds.length})</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Videos Table */}
                <div style={{ overflowX: "auto" }}>
                  <table className="vap-table" style={{ width: "100%", fontSize: "0.85rem" }}>
                    <thead>
                      <tr>
                        <th style={{ width: "40px", textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={getFilteredOtherPsVideos().length > 0 && selectedOtherPsIds.length === getFilteredOtherPsVideos().length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedOtherPsIds(getFilteredOtherPsVideos().map((v) => v.id));
                              } else {
                                setSelectedOtherPsIds([]);
                              }
                            }}
                          />
                        </th>
                        <th style={{ minWidth: "260px" }}>Video</th>
                        <th style={{ minWidth: "140px" }}>Sync Status</th>
                        <th style={{ minWidth: "150px" }}>Active Stream Source</th>
                        <th style={{ minWidth: "260px" }}>URLs (Primary & Backup)</th>
                        <th style={{ minWidth: "180px", textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getFilteredOtherPsVideos().length === 0 ? (
                        <tr>
                          <td colSpan="6" style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                            <HardDrive size={36} style={{ display: "block", margin: "0 auto 10px", opacity: 0.4 }} />
                            Koi video nahi mili is filter ke sath.
                          </td>
                        </tr>
                      ) : (
                        getFilteredOtherPsVideos().map((v) => {
                          const isSynced = isOtherPsSynced(v);
                          const isSelected = selectedOtherPsIds.includes(v.id);
                          const activeSource = v.active_source || (isSynced ? "our_server" : "other_ps");
                          const primaryUrl = v.videoUrl || "";
                          const secondaryUrl = v.backup_url || v.other_ps_url || "";

                          return (
                            <tr key={v.id} style={{ background: isSelected ? "rgba(59, 130, 246, 0.04)" : "transparent" }}>
                              {/* Checkbox */}
                              <td style={{ textAlign: "center" }}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedOtherPsIds([...selectedOtherPsIds, v.id]);
                                    } else {
                                      setSelectedOtherPsIds(selectedOtherPsIds.filter((id) => id !== v.id));
                                    }
                                  }}
                                />
                              </td>

                              {/* Video Details */}
                              <td>
                                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                                  <div
                                    style={{ position: "relative", width: "72px", height: "42px", borderRadius: "6px", overflow: "hidden", background: "#0f172a", flexShrink: 0, cursor: "pointer" }}
                                    onClick={() => setPreviewVideo(v)}
                                  >
                                    <img
                                      src={v.thumbnail || FALLBACK_THUMBNAIL}
                                      alt={v.title}
                                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                      onError={(e) => { e.target.src = FALLBACK_THUMBNAIL; }}
                                    />
                                    {v.duration && (
                                      <span style={{ position: "absolute", bottom: "2px", right: "2px", background: "rgba(0,0,0,0.8)", color: "#fff", fontSize: "0.68rem", padding: "0 3px", borderRadius: "2px" }}>
                                        {v.duration}
                                      </span>
                                    )}
                                  </div>

                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "240px" }} title={v.title}>
                                      {cleanDisplayTitle(v.title)}
                                    </div>
                                    <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "2px", fontSize: "0.74rem", color: "#64748b" }}>
                                      <span className="vap-cat-pill" style={{ padding: "1px 6px", fontSize: "0.7rem" }}>
                                        {v.category || "General"}
                                      </span>
                                      <span>{v.uploadedAt || "Uploaded"}</span>
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Sync Status */}
                              <td>
                                {isSynced ? (
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#dcfce7", color: "#15803d", padding: "4px 8px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 700 }}>
                                    <CheckCircle2 size={13} />
                                    <span>✓ Synced in R2</span>
                                  </span>
                                ) : (
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#fef3c7", color: "#b45309", padding: "4px 8px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 700 }}>
                                    <AlertCircle size={13} />
                                    <span>⚠️ Only Friend Server</span>
                                  </span>
                                )}
                              </td>

                              {/* Active Stream Source */}
                              <td>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span style={{
                                    display: "inline-block",
                                    padding: "3px 8px",
                                    borderRadius: "6px",
                                    fontSize: "0.75rem",
                                    fontWeight: 700,
                                    background: activeSource === "our_server" ? "#dbeafe" : "#f3e8ff",
                                    color: activeSource === "our_server" ? "#1d4ed8" : "#6b21a8"
                                  }}>
                                    {activeSource === "our_server" ? "☁️ Our Server" : "🔗 Other PS"}
                                  </span>

                                  {isSynced && (
                                    <button
                                      type="button"
                                      onClick={() => handleSwitchOtherPsSource(v.id, activeSource === "our_server" ? "other_ps" : "our_server")}
                                      style={{ background: "none", border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 6px", fontSize: "0.7rem", cursor: "pointer", color: "#475569" }}
                                      title={`Switch to stream from ${activeSource === "our_server" ? "Other PS" : "Our Server"}`}
                                    >
                                      Switch
                                    </button>
                                  )}
                                </div>
                              </td>

                              {/* URLs (Primary & Secondary) */}
                              <td>
                                <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.75rem" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                    <span style={{ fontWeight: 600, color: "#16a34a", minWidth: "55px" }}>Primary:</span>
                                    <span style={{ color: "#334155", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={primaryUrl}>
                                      {primaryUrl}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        navigator.clipboard.writeText(primaryUrl);
                                        showSuccess("Primary URL copied to clipboard!");
                                      }}
                                      style={{ background: "none", border: "none", padding: "1px 4px", cursor: "pointer", color: "#94a3b8" }}
                                      title="Copy Primary URL"
                                    >
                                      <Copy size={12} />
                                    </button>
                                  </div>

                                  {secondaryUrl && (
                                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                      <span style={{ fontWeight: 600, color: "#64748b", minWidth: "55px" }}>Backup:</span>
                                      <span style={{ color: "#64748b", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={secondaryUrl}>
                                        {secondaryUrl}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          navigator.clipboard.writeText(secondaryUrl);
                                          showSuccess("Backup URL copied to clipboard!");
                                        }}
                                        style={{ background: "none", border: "none", padding: "1px 4px", cursor: "pointer", color: "#94a3b8" }}
                                        title="Copy Backup URL"
                                      >
                                        <Copy size={12} />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </td>

                              {/* Row Actions */}
                              <td style={{ textAlign: "right" }}>
                                <div style={{ display: "inline-flex", gap: "6px" }}>
                                  {!isSynced ? (
                                    <button
                                      type="button"
                                      className="vap-btn-primary"
                                      onClick={() => handleSyncOtherPsVideos(v.id)}
                                      disabled={isSyncingStorage}
                                      style={{ background: "#16a34a", padding: "5px 10px", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "4px" }}
                                      title="Download video to Cloudflare R2"
                                    >
                                      <Zap size={13} />
                                      <span>Sync to Storage</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="vap-btn-secondary"
                                      onClick={() => handleSyncOtherPsVideos(v.id)}
                                      disabled={isSyncingStorage}
                                      style={{ padding: "5px 10px", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "4px" }}
                                      title="Re-download and refresh R2 storage copy"
                                    >
                                      <RefreshCw size={13} />
                                      <span>Re-sync</span>
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    className="vap-icon-btn"
                                    onClick={() => handleEditVideoClick(v)}
                                    title="Edit video"
                                  >
                                    <Pencil size={14} />
                                  </button>

                                  <button
                                    type="button"
                                    className="vap-icon-btn danger"
                                    onClick={() => handleDeleteVideoClick(v)}
                                    title="Delete video"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
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

      {/* ========================================================
          EXCEL DATA EXPORT MODAL
          ======================================================== */}
      {showExportModal && (
        <div className="vap-modal-backdrop" onClick={() => !isExporting && setShowExportModal(false)}>
          <div className="vap-modal-content vap-export-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vap-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", color: "#16a34a" }}>
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0 }}>Export Videos to Excel</h3>
                  <span className="vap-export-header-badge">.xlsx Format</span>
                </div>
              </div>
              <button
                className="vap-icon-btn"
                onClick={() => !isExporting && setShowExportModal(false)}
                disabled={isExporting}
              >
                <X size={18} />
              </button>
            </div>

            <div className="vap-modal-body">
              <p style={{ margin: "0 0 14px", color: "#475569", fontSize: "0.9rem" }}>
                Select karein aapko kaunse format ki videos export karni hain. Excel sheet me exact standard columns aayengi:
              </p>

              {/* Quick Preset Buttons */}
              <div className="vap-export-presets">
                <button
                  type="button"
                  className="vap-export-preset-btn"
                  onClick={() => {
                    setExportIncludeStorage(true);
                    setExportIncludeLinks(true);
                  }}
                >
                  ✓ Sabhi Videos (All: {allCurrentList.length})
                </button>
                <button
                  type="button"
                  className="vap-export-preset-btn"
                  onClick={() => {
                    setExportIncludeStorage(true);
                    setExportIncludeLinks(false);
                  }}
                >
                  ☁️ Our Server Only (R2) ({ourServerOnlyCount})
                </button>
                <button
                  type="button"
                  className="vap-export-preset-btn"
                  onClick={() => {
                    setExportIncludeStorage(false);
                    setExportIncludeLinks(true);
                  }}
                >
                  🔗 Other Person Storage (Other PS) ({otherPsOnlyCount})
                </button>
              </div>

              {/* Selection Cards with Checkboxes */}
              <div className="vap-export-card-group">
                {/* 1. Cloudflare R2 Storage Card */}
                <div
                  className={`vap-export-card ${exportIncludeStorage ? "selected" : ""}`}
                  onClick={() => setExportIncludeStorage(!exportIncludeStorage)}
                >
                  <div className="vap-export-card-checkbox">
                    {exportIncludeStorage && <Check size={14} strokeWidth={3} />}
                  </div>
                  <div className="vap-export-card-content">
                    <div className="vap-export-card-title-row">
                      <span className="vap-export-card-title">
                        Hamara Server Storage ({ourServerOnlyCount})
                      </span>
                      <span className="vap-export-card-pill">
                        Cloudflare R2 Bucket
                      </span>
                    </div>
                    <p className="vap-export-card-desc">
                      Wo saari videos jo aapke Cloudflare R2 bucket me uploaded hain (/cdn/, r2.dev).
                    </p>
                  </div>
                </div>

                {/* 2. Direct Links Card */}
                <div
                  className={`vap-export-card ${exportIncludeLinks ? "selected" : ""}`}
                  onClick={() => setExportIncludeLinks(!exportIncludeLinks)}
                >
                  <div className="vap-export-card-checkbox">
                    {exportIncludeLinks && <Check size={14} strokeWidth={3} />}
                  </div>
                  <div className="vap-export-card-content">
                    <div className="vap-export-card-title-row">
                      <span className="vap-export-card-title">
                        Other Person Storage (Other PS) ({otherPsOnlyCount})
                      </span>
                      <span className="vap-export-card-pill">
                        External Direct Links
                      </span>
                    </div>
                    <p className="vap-export-card-desc">
                      Wo saari videos jo external direct URLs ya friends ke links ke zariye upload hain.
                    </p>
                  </div>
                </div>
              </div>

              {/* Format Columns Preview */}
              <div className="vap-export-format-preview">
                <div><strong>Columns in Exported Excel:</strong></div>
                <div className="vap-export-cols-tags">
                  <span className="vap-export-col-tag">Video URL</span>
                  <span className="vap-export-col-tag">Thumbnail URL</span>
                  <span className="vap-export-col-tag">Title</span>
                  <span className="vap-export-col-tag">Description</span>
                  <span className="vap-export-col-tag">Category</span>
                  <span className="vap-export-col-tag">Tags</span>
                  <span className="vap-export-col-tag">Duration</span>
                  <span className="vap-export-col-tag">Initial Views</span>
                  <span className="vap-export-col-tag">Initial Likes</span>
                  <span className="vap-export-col-tag">Privacy</span>
                  <span className="vap-export-col-tag">Upload Date</span>
                  <span className="vap-export-col-tag">Upload Time</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="vap-btn-secondary"
                  onClick={() => setShowExportModal(false)}
                  disabled={isExporting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="vap-btn-primary"
                  onClick={handleExportToExcel}
                  disabled={isExporting || (!exportIncludeStorage && !exportIncludeLinks)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "8px", minWidth: "180px", justifyContent: "center" }}
                >
                  {isExporting ? (
                    <>
                      <Loader2 size={16} className="vap-spin" />
                      <span>Generating Excel...</span>
                    </>
                  ) : (
                    <>
                      <Download size={16} />
                      <span>Download Excel (.xlsx)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          EXCEL DATA IMPORT MODAL
          ======================================================== */}
      {showImportExcelModal && (
        <div className="vap-modal-backdrop" onClick={() => !isImportingExcel && setShowImportExcelModal(false)}>
          <div className="vap-modal-content vap-export-modal" style={{ maxWidth: "720px", width: "95%" }} onClick={(e) => e.stopPropagation()}>
            <div className="vap-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", color: "#16a34a" }}>
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0 }}>Import Videos from Excel</h3>
                  <span className="vap-export-header-badge">.xlsx / .xls / .csv</span>
                </div>
              </div>
              <button
                className="vap-icon-btn"
                onClick={() => !isImportingExcel && setShowImportExcelModal(false)}
                disabled={isImportingExcel}
              >
                <X size={18} />
              </button>
            </div>

            <div className="vap-modal-body" style={{ maxHeight: "72vh", overflowY: "auto", padding: "18px 22px" }}>
              {/* Guidance Info Box */}
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px 14px", marginBottom: "16px", fontSize: "0.83rem", color: "#475569" }}>
                <div style={{ fontWeight: 600, color: "#1e293b", marginBottom: "4px" }}>
                  📋 Excel Bulk Import Guidelines:
                </div>
                <ul style={{ margin: "4px 0 0", paddingLeft: "18px", lineHeight: "1.5" }}>
                  <li>Only <strong>Video URL</strong> is required. If Title, Description, Category, Tags, Duration, or Thumbnail are empty, they will <strong>auto-fetch directly from the link</strong>.</li>
                  <li>Views & Likes default to <strong>0</strong>. Upload Date & Time can be specified in Excel (DD/MM/YYYY and HH:MM:SS) or will default to current time.</li>
                  <li>Videos already present in your database are <strong>auto-verified in &lt;1ms and skipped</strong>.</li>
                </ul>
              </div>

              {/* Storage Mode Toggle Row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: saveToServer ? "#f0fdf4" : "#f1f5f9", border: `1.5px solid ${saveToServer ? "#86efac" : "#cbd5e1"}`, borderRadius: "8px", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <div style={{ fontSize: "0.86rem", fontWeight: 700, color: saveToServer ? "#166534" : "#334155", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Server size={15} color={saveToServer ? "#16a34a" : "#64748b"} />
                    <span>Server Storage: <strong>{saveToServer ? "ON" : "OFF"}</strong></span>
                  </div>
                  <div style={{ fontSize: "0.76rem", color: saveToServer ? "#15803d" : "#64748b", marginTop: "2px" }}>
                    {saveToServer ? "Videos will be saved directly into Cloudflare R2 / Server storage." : "Videos will stream directly via source link without using server storage."}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSaveToServer()}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "6px",
                    border: saveToServer ? "1px solid #16a34a" : "1px solid #94a3b8",
                    background: saveToServer ? "#dcfce7" : "#ffffff",
                    color: saveToServer ? "#15803d" : "#334155",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  Turn {saveToServer ? "OFF" : "ON"}
                </button>
              </div>

              {/* Sample Template Download */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
                <span style={{ fontSize: "0.84rem", fontWeight: 600, color: "#334155" }}>Select Excel or CSV Spreadsheet:</span>
                <button
                  type="button"
                  className="vap-btn-secondary"
                  onClick={handleDownloadExcelTemplate}
                  style={{ fontSize: "0.8rem", padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: "5px" }}
                >
                  <Download size={13} />
                  <span>Download Sample Template (.xlsx)</span>
                </button>
              </div>

              {/* Excel Dropzone */}
              <input
                type="file"
                ref={excelInputRef}
                accept=".xlsx,.xls,.csv"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleExcelFileSelect(file);
                }}
              />

              <div
                className="vap-dropzone"
                onClick={() => excelInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.[0]) handleExcelFileSelect(e.dataTransfer.files[0]);
                }}
                style={{
                  padding: "22px 14px",
                  cursor: "pointer",
                  marginBottom: "16px",
                  border: excelFile ? "2px solid #22c55e" : "2px dashed #94a3b8",
                  background: excelFile ? "#f0fdf4" : undefined
                }}
              >
                <div className="vap-dropzone-icon" style={{ marginBottom: "6px", color: excelFile ? "#16a34a" : "#2563eb" }}>
                  <FileSpreadsheet size={28} />
                </div>
                <div className="vap-dropzone-prompt" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                  {excelFile ? `✓ Selected: ${excelFile.name}` : "Click or Drag & Drop Excel File Here"}
                </div>
                <span className="vap-dropzone-sub" style={{ fontSize: "0.76rem", marginTop: "4px" }}>
                  {excelFile ? `${(excelFile.size / 1024).toFixed(1)} KB — Click to change file` : "Supports .xlsx, .xls, and .csv formats"}
                </span>
              </div>

              {/* Stats Summary */}
              {excelParsedRows.length > 0 && (
                <div style={{ marginBottom: "16px" }}>
                  {(() => {
                    const readyCount = excelParsedRows.filter((r) => r.isValid && !r.isDuplicate).length;
                    const dupCount = excelParsedRows.filter((r) => r.isDuplicate).length;
                    const errCount = excelParsedRows.filter((r) => !r.isValid).length;

                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "10px", borderRadius: "8px", textAlign: "center" }}>
                            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#166534" }}>{readyCount}</div>
                            <div style={{ fontSize: "0.76rem", color: "#15803d", fontWeight: 600 }}>Ready to Publish</div>
                          </div>
                          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", padding: "10px", borderRadius: "8px", textAlign: "center" }}>
                            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#b45309" }}>{dupCount}</div>
                            <div style={{ fontSize: "0.76rem", color: "#92400e", fontWeight: 600 }}>Already Published (Skip)</div>
                          </div>
                          <div style={{ background: errCount > 0 ? "#fef2f2" : "#f8fafc", border: `1px solid ${errCount > 0 ? "#fecaca" : "#e2e8f0"}`, padding: "10px", borderRadius: "8px", textAlign: "center" }}>
                            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: errCount > 0 ? "#dc2626" : "#64748b" }}>{errCount}</div>
                            <div style={{ fontSize: "0.76rem", color: "#64748b", fontWeight: 600 }}>Invalid Rows</div>
                          </div>
                        </div>

                        {dupCount > 0 && (
                          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "6px", padding: "8px 12px", fontSize: "0.8rem", color: "#92400e", display: "flex", alignItems: "center", gap: "6px" }}>
                            <AlertCircle size={15} color="#d97706" style={{ flexShrink: 0 }} />
                            <span>{dupCount} videos are already published in your database and will be automatically skipped to prevent duplicates.</span>
                          </div>
                        )}

                        {/* Preview Table of parsed rows */}
                        <div style={{ maxHeight: "160px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "6px" }}>
                          <table className="vap-excel-validation-table" style={{ margin: 0, fontSize: "0.78rem" }}>
                            <thead>
                              <tr>
                                <th style={{ padding: "6px 8px" }}>Row</th>
                                <th style={{ padding: "6px 8px" }}>Status</th>
                                <th style={{ padding: "6px 8px" }}>Title / Video URL</th>
                                <th style={{ padding: "6px 8px" }}>Category</th>
                                <th style={{ padding: "6px 8px" }}>Upload Date & Time</th>
                              </tr>
                            </thead>
                            <tbody>
                              {excelParsedRows.slice(0, 15).map((r) => (
                                <tr key={r.rowNum} style={{ background: r.isDuplicate ? "#fffbeb" : (r.isValid ? "#ffffff" : "#fef2f2") }}>
                                  <td style={{ padding: "5px 8px" }}>#{r.rowNum}</td>
                                  <td style={{ padding: "5px 8px" }}>
                                    {r.isDuplicate ? (
                                      <span style={{ color: "#b45309", fontWeight: 600 }}>Already Published</span>
                                    ) : r.isValid ? (
                                      <span style={{ color: "#16a34a", fontWeight: 600 }}>Ready</span>
                                    ) : (
                                      <span style={{ color: "#dc2626", fontWeight: 600 }}>Invalid</span>
                                    )}
                                  </td>
                                  <td style={{ padding: "5px 8px", maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    <strong>{r.title || cleanDisplayTitle(r.videoUrl)}</strong>
                                    <div style={{ fontSize: "0.72rem", color: "#64748b" }}>{r.videoUrl}</div>
                                  </td>
                                  <td style={{ padding: "5px 8px" }}>{r.category || "General"}</td>
                                  <td style={{ padding: "5px 8px", fontSize: "0.74rem", color: "#475569", whiteSpace: "nowrap" }}>
                                    <div>📅 {r.uploadDate || "-"}</div>
                                    <div style={{ color: "#64748b" }}>⏰ {r.uploadTime || "-"}</div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Progress Bar during import */}
              {isImportingExcel && (
                <div style={{ marginBottom: "16px", background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", fontWeight: 600, marginBottom: "6px" }}>
                    <span style={{ color: "#166534", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Loader2 size={14} className="animate-spin" />
                      {excelImportStep || "Importing videos..."}
                    </span>
                    <span style={{ color: "#166534", fontWeight: 700 }}>{excelProgress}%</span>
                  </div>
                  <div style={{ width: "100%", height: "8px", background: "#e2e8f0", borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{ width: `${excelProgress}%`, height: "100%", background: "#16a34a", transition: "width 0.2s" }} />
                  </div>
                </div>
              )}

              {/* Skipped Rows Download Alert */}
              {lastSkippedRows.length > 0 && (
                <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: "8px", padding: "12px 14px", marginBottom: "14px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                  <div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#92400e" }}>
                      {lastSkippedRows.length} Videos Skipped / Unpublished
                    </div>
                    <div style={{ fontSize: "0.76rem", color: "#78350f" }}>
                      These video links are already present on your website or were duplicates.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleExportSkippedExcel(lastSkippedRows)}
                    style={{
                      padding: "6px 12px",
                      background: "#b45309",
                      color: "#fff",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      cursor: "pointer"
                    }}
                  >
                    <Download size={13} />
                    <span>Download Skipped Excel (.xlsx)</span>
                  </button>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="vap-modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: "10px", padding: "12px 20px", borderTop: "1px solid #e2e8f0" }}>
              <button
                type="button"
                className="vap-btn-secondary"
                onClick={() => setShowImportExcelModal(false)}
                disabled={isImportingExcel}
              >
                Close
              </button>
              <button
                type="button"
                className="vap-btn-primary"
                onClick={handleImportExcelVideos}
                disabled={isImportingExcel || excelParsedRows.filter((r) => r.isValid && !r.isDuplicate).length === 0}
                style={{
                  background: "#16a34a",
                  borderColor: "#16a34a",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
                  padding: "9px 20px"
                }}
              >
                {isImportingExcel ? (
                  <><Loader2 className="animate-spin" size={15} /> Importing...</>
                ) : (
                  <><UploadCloud size={15} /> Import & Publish ({excelParsedRows.filter((r) => r.isValid && !r.isDuplicate).length}) Videos</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
