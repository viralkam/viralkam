import React, { useState, useMemo } from "react";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";
import VideoCard from "./components/VideoCard";
import WatchView from "./components/WatchView";
import AdminPanel from "./components/AdminPanel";
import LegalPage from "./components/LegalPage";
import { VideoSkeletonGrid } from "./components/VideoSkeleton";
import { INITIAL_VIDEOS, CATEGORIES } from "./mockVideos";
import { api } from "./services/api";

export default function App() {
  // Load cached videos immediately on refresh to eliminate any visual flicker
  const [videos, setVideos] = useState(() => {
    try {
      const cached = sessionStorage.getItem("vk_cached_videos");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return INITIAL_VIDEOS;
  });

  const [isLoading, setIsLoading] = useState(() => {
    try {
      const cached = sessionStorage.getItem("vk_cached_videos");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return false;
      }
    } catch {}
    return true;
  });

  const [selectedVideo, setSelectedVideo] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("newest"); // "newest" | "popular" | "most_viewed" | "longest" | "random"
  const [activeCategory, setActiveCategory] = useState(null);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [activeLegalPage, setActiveLegalPage] = useState(null); // "dmca" | "compliance" | "terms" | null
  const [currentPage, setCurrentPage] = useState(1);

  const VIDEOS_PER_PAGE = 24;
  const [totalVideosCount, setTotalVideosCount] = useState(0);

  // Load videos per-page on demand (prevents network overload)
  const loadData = React.useCallback(async (pageToLoad = 1) => {
    setIsLoading(true);
    try {
      const res = await api.getVideos({
        page: pageToLoad,
        limit: VIDEOS_PER_PAGE,
        search: searchQuery.trim(),
        category: activeCategory || "",
        sort: activeFilter || "newest"
      });
      if (res && res.videos) {
        setVideos(res.videos);
        if (res.pagination) {
          setTotalVideosCount(res.pagination.totalVideos !== undefined ? res.pagination.totalVideos : res.videos.length);
        } else {
          setTotalVideosCount(res.videos.length);
        }
      }
    } catch (e) {
      console.warn("Database sync warning, using initial dataset:", e);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, activeCategory, activeFilter]);

  React.useEffect(() => {
    loadData(currentPage);
  }, [currentPage, loadData]);

  // Reset page to 1 whenever search, category, or filter changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeCategory, activeFilter]);

  const totalPages = Math.max(1, Math.ceil(totalVideosCount / VIDEOS_PER_PAGE));
  const paginatedVideos = videos;

  const getPageNumbers = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (currentPage <= 4) {
      return [1, 2, 3, 4, 5, "...", totalPages];
    } else if (currentPage >= totalPages - 3) {
      return [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    } else {
      return [1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages];
    }
  };

  // Sync initial URL on mount and handle browser back/forward
  React.useEffect(() => {
    const handleLocationChange = () => {
      const params = new URLSearchParams(window.location.search);
      const videoId = params.get("v");
      const path = window.location.pathname;

      const lowerPath = path.toLowerCase();
      const lowerSearch = window.location.search.toLowerCase();
      const lowerHash = window.location.hash.toLowerCase();

      if (
        lowerPath === "/adminenable" ||
        lowerPath === "/adminenable/" ||
        lowerPath === "/admin" ||
        lowerPath === "/admin/" ||
        lowerSearch.includes("adminenable") ||
        lowerSearch.includes("admin") ||
        lowerHash.includes("adminenable") ||
        lowerHash.includes("admin")
      ) {
        setIsAdminOpen(true);
        setSelectedVideo(null);
        setActiveLegalPage(null);
      } else if (
        path === "/dmca" || 
        window.location.hash === "#dmca" || 
        window.location.search.includes("dmca")
      ) {
        setActiveLegalPage("dmca");
        setIsAdminOpen(false);
        setSelectedVideo(null);
      } else if (
        path === "/compliance" || 
        path === "/18-u-s-c-2257" || 
        window.location.hash === "#compliance" || 
        window.location.search.includes("2257")
      ) {
        setActiveLegalPage("compliance");
        setIsAdminOpen(false);
        setSelectedVideo(null);
      } else if (
        path === "/terms" || 
        path === "/terms-of-use" || 
        window.location.hash === "#terms"
      ) {
        setActiveLegalPage("terms");
        setIsAdminOpen(false);
        setSelectedVideo(null);
      } else if (videoId) {
        const found = videos.find((v) => v.id === videoId);
        if (found) {
          setSelectedVideo(found);
          setIsAdminOpen(false);
          setActiveLegalPage(null);
        } else {
          api.getVideoById(videoId).then((v) => {
            if (v) {
              setSelectedVideo(v);
              setIsAdminOpen(false);
              setActiveLegalPage(null);
            }
          }).catch(() => {});
        }
      } else {
        setSelectedVideo(null);
        setIsAdminOpen(false);
        setActiveLegalPage(null);
      }
    };

    handleLocationChange();
    window.addEventListener("popstate", handleLocationChange);
    return () => window.removeEventListener("popstate", handleLocationChange);
  }, [videos]);

  const handleSelectVideo = (video) => {
    setSelectedVideo(video);
    setIsAdminOpen(false);
    setActiveLegalPage(null);
    window.history.pushState({}, "", `?v=${video.id}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleNavigateHome = () => {
    setSelectedVideo(null);
    setIsAdminOpen(false);
    setActiveLegalPage(null);
    setActiveCategory(null);
    setActiveFilter("newest");
    setSearchQuery("");
    window.history.pushState({}, "", "/");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSelectCategory = (cat) => {
    setActiveCategory(cat);
    setSelectedVideo(null);
    setIsAdminOpen(false);
    setActiveLegalPage(null);
    window.history.pushState({}, "", "/");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleOpenAdmin = () => {
    setIsAdminOpen(true);
    setSelectedVideo(null);
    setActiveLegalPage(null);
    window.history.pushState({}, "", "/adminenable");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleOpenLegalPage = (pageKey) => {
    setActiveLegalPage(pageKey);
    setSelectedVideo(null);
    setIsAdminOpen(false);
    window.history.pushState({}, "", `#${pageKey}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Dynamic categories state loaded from backend
  const [categories, setCategories] = useState(CATEGORIES);

  React.useEffect(() => {
    api.getCategories().then((cats) => {
      if (cats && cats.length > 0) {
        setCategories(cats.map((c) => c.name));
      }
    }).catch(() => {});
  }, []);

  const handleAddVideo = async (newVideo) => {
    // 1. Strictly save to Cloudflare D1 / Database Storage
    // Video is NOT saved in local storage - it goes directly to server database
    const saved = await api.createVideo(newVideo);
    const finalVideo = saved || newVideo;

    // 2. Update React state immediately on platform
    setVideos((prev) => [finalVideo, ...prev.filter((v) => v.id !== finalVideo.id)]);

    return finalVideo;
  };

  const handleUpdateVideo = async (updatedVideo) => {
    setVideos((prev) => prev.map((v) => (v.id === updatedVideo.id ? updatedVideo : v)));
    if (selectedVideo && selectedVideo.id === updatedVideo.id) {
      setSelectedVideo(updatedVideo);
    }
    return updatedVideo;
  };

  const handleDeleteVideo = async (id) => {
    // 1. Remove from React state
    setVideos((prev) => prev.filter((v) => v.id !== id));
    if (selectedVideo && selectedVideo.id === id) {
      setSelectedVideo(null);
    }

    // 2. Delete strictly from Cloudflare D1 Database
    try {
      await api.deleteVideo(id);
    } catch (e) {
      console.error("Failed to delete from database:", e);
    }
  };

  if (isAdminOpen) {
    return (
      <AdminPanel
        videos={videos}
        categories={categories}
        onAddVideo={handleAddVideo}
        onUpdateVideo={handleUpdateVideo}
        onDeleteVideo={handleDeleteVideo}
        onExitAdmin={handleNavigateHome}
        onViewVideo={handleSelectVideo}
      />
    );
  }

  return (
    <div className="site-wrapper">
      {/* Top Navbar */}
      <Navbar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onNavigateHome={handleNavigateHome}
        onOpenAdmin={handleOpenAdmin}
        isAdminActive={isAdminOpen}
        categories={categories}
        onSelectCategory={handleSelectCategory}
        activeFilter={activeFilter}
        setActiveFilter={(f) => {
          setActiveFilter(f);
          setActiveCategory(null);
        }}
      />

      {/* Main Body Layout */}
      {activeLegalPage ? (
        /* Dedicated Legal Pages (DMCA, 18 U.S.C 2257, Terms of Use) */
        <main className="legal-view-container">
          <LegalPage
            pageType={activeLegalPage}
            onNavigateHome={handleNavigateHome}
            onSelectLegalPage={handleOpenLegalPage}
          />
        </main>
      ) : selectedVideo ? (
        /* Video Watch Page */
        <main className="watch-page-wrapper">
          <WatchView
            video={selectedVideo}
            allVideos={videos}
            onSelectVideo={handleSelectVideo}
            onNavigateHome={handleNavigateHome}
            onSelectCategory={handleSelectCategory}
            onSelectLegalPage={handleOpenLegalPage}
          />
        </main>
      ) : (
        /* Home / Category Feed with Left Sidebar + 6-Column Video Grid */
        <div className="main-layout-container">
          {/* Left Sidebar */}
          <Sidebar
            activeFilter={activeFilter}
            setActiveFilter={(f) => {
              setActiveFilter(f);
              setActiveCategory(null);
            }}
            activeCategory={activeCategory}
            setActiveCategory={(cat) => {
              setActiveCategory(cat);
            }}
            categories={CATEGORIES}
            onResetToHome={() => {
              setSelectedVideo(null);
              setIsAdminOpen(false);
            }}
          />

          {/* Right Main Grid */}
          <main className="site-content-area">
            {activeCategory && (
              <div className="category-page-header">
                <h1 className="category-page-title">{activeCategory}</h1>
                <p className="category-page-sub">
                  Top {activeCategory} Daily Updated Latest Viral Videos
                </p>
              </div>
            )}

            {isLoading ? (
              <VideoSkeletonGrid count={24} />
            ) : paginatedVideos.length > 0 ? (
              <div className="tube-video-grid">
                {paginatedVideos.map((video) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    onSelectVideo={handleSelectVideo}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-feed-wrap">
                <div className="empty-feed-card">
                  <h3 className="empty-feed-title">No Videos Published Yet</h3>
                  <p className="empty-feed-sub">
                    Latest viral and trending videos will appear here shortly.
                  </p>
                </div>
              </div>
            )}

            {/* Dynamic Real Numbered Pagination Bar (24 videos per page) */}
            {totalPages > 1 && (
              <div className="tube-pagination-wrap">
                {currentPage > 1 && (
                  <button
                    className="page-num-box"
                    onClick={() => {
                      setCurrentPage((p) => Math.max(1, p - 1));
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    title="Previous Page"
                  >
                    «
                  </button>
                )}

                {getPageNumbers().map((item, idx) =>
                  item === "..." ? (
                    <span key={`dots-${idx}`} className="page-dots">
                      ...
                    </span>
                  ) : (
                    <button
                      key={`page-${item}`}
                      className={`page-num-box ${currentPage === item ? "active" : ""}`}
                      onClick={() => {
                        setCurrentPage(item);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      {item}
                    </button>
                  )
                )}

                {currentPage < totalPages && (
                  <button
                    className="page-num-box"
                    onClick={() => {
                      setCurrentPage((p) => Math.min(totalPages, p + 1));
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    title="Next Page"
                  >
                    »
                  </button>
                )}
              </div>
            )}

            {/* Site SEO Description Banner (matching Screenshot) */}
            <section className="feed-seo-banner">
              <h2 className="feed-seo-title">
                VIRALKAAM.COM! Daily Updated Latest Viral Videos
              </h2>
              <p className="feed-seo-desc">
                2026 2025 New Viral Videos Free Streaming Web Platform!
              </p>
            </section>

            {/* Footer Links (matching Screenshot) */}
            <footer className="feed-footer-bottom">
              <div className="footer-links-row">
                <button className="footer-nav-link" onClick={() => handleOpenLegalPage("dmca")}>
                  DMCA — Remove A Video
                </button>
                <span className="sep-divider">|</span>
                <button className="footer-nav-link" onClick={() => handleOpenLegalPage("compliance")}>
                  18 U.S.C 2257
                </button>
                <span className="sep-divider">|</span>
                <button className="footer-nav-link" onClick={() => handleOpenLegalPage("terms")}>
                  Terms of Use
                </button>
              </div>
              <p className="footer-copyright-text">
                © 2026 - VIRALKAAM.COM. All rights reserved.
              </p>
            </footer>
          </main>
        </div>
      )}
    </div>
  );
}
