import React, { useState, useEffect } from "react";
import VideoPlayer from "./VideoPlayer";
import VideoCard from "./VideoCard";
import { CONFIG } from "../config";
import { 
  ThumbsUp, 
  ThumbsDown, 
  Eye, 
  Tag, 
  Folder, 
  Sparkles, 
  Bot, 
  Globe,
  Play
} from "lucide-react";
import { 
  generateVideoSEO_AEO_GEO, 
  applySEOToHead, 
  resetSEOToHome 
} from "../utils/seoEngine";
import { api } from "../services/api";
import { cleanDisplayTitle, cleanVideoUrl, FALLBACK_THUMBNAIL } from "../utils/format";

export default function WatchView({ 
  video, 
  allVideos, 
  onSelectVideo, 
  onNavigateHome, 
  onSelectCategory, 
  onSelectLegalPage 
}) {
  const [likes, setLikes] = useState(video.likes || 1200);
  const [dislikes, setDislikes] = useState(video.dislikes || 50);
  const [userVote, setUserVote] = useState(null); // 'like' | 'dislike' | null
  
  // Fast first-paint: Template, title & description load first; video stream connects on play
  const [hasUserStartedPlay, setHasUserStartedPlay] = useState(false);

  useEffect(() => {
    setHasUserStartedPlay(false);
  }, [video?.id]);

  // Automatically generate and inject SEO, AEO, and GEO metadata into document head
  useEffect(() => {
    if (video) {
      // Ping backend to register view increment
      api.getVideoById(video.id).catch(() => {});

      const seoData = video.schemaJsonLd ? {
        seoTitle: video.seoTitle,
        seoDescription: video.seoDescription,
        canonicalUrl: video.canonicalUrl || `https://viralkam.com/?v=${video.id}`,
        aeoSummary: video.aeoSummary,
        aeoKeyFacts: video.aeoKeyFacts,
        geoEntities: video.geoEntities,
        schemaJsonLd: video.schemaJsonLd
      } : generateVideoSEO_AEO_GEO(video);

      applySEOToHead(seoData);
    }

    return () => {
      resetSEOToHome();
    };
  }, [video]);

  const handleVote = (type) => {
    if (userVote === type) {
      if (type === "like") setLikes((prev) => prev - 1);
      if (type === "dislike") setDislikes((prev) => prev - 1);
      setUserVote(null);
    } else {
      if (type === "like") {
        setLikes((prev) => prev + 1);
        if (userVote === "dislike") setDislikes((prev) => prev - 1);
      } else {
        setDislikes((prev) => prev + 1);
        if (userVote === "like") setLikes((prev) => prev - 1);
      }
      setUserVote(type);
      api.voteVideo(video.id, type).catch(() => {});
    }
  };

  const totalVotes = likes + dislikes;
  const likePercent = totalVotes > 0 ? Math.round((likes / totalVotes) * 100) : 100;

  const cleanTitle = cleanDisplayTitle(video.title);
  const cleanUrl = cleanVideoUrl(video.videoUrl);

  const playerOptions = {
    autoplay: false,
    controls: true,
    responsive: true,
    fill: true,
    poster: video.thumbnail || FALLBACK_THUMBNAIL,
    sources: [
      {
        src: cleanUrl,
        type: cleanUrl && cleanUrl.includes(".m3u8") ? "application/x-mpegURL" : "video/mp4"
      }
    ]
  };

  // Detect if video is an iframe embed (Streamtape, Dood, Vidhide, etc.)
  const isEmbed = Boolean(
    video.embedUrl ||
    (video.videoUrl && (
      video.videoUrl.includes("/embed/") ||
      video.videoUrl.includes("/e/") ||
      video.videoUrl.includes("dood") ||
      video.videoUrl.includes("streamtape") ||
      video.videoUrl.includes("vidhide") ||
      video.videoUrl.includes("luluvdo") ||
      video.videoUrl.includes("voe.sx") ||
      video.videoUrl.includes("filemoon")
    ))
  );
  const embedSourceUrl = video.embedUrl || video.videoUrl;

  // Smart Suggestion Logic:
  // 1. Same category videos first
  // 2. Videos sharing tags
  // 3. Other trending videos to fill exactly 12 cards (2 rows of 6)
  const relatedVideosList = React.useMemo(() => {
    const others = allVideos.filter((v) => v.id !== video.id);
    const sameCat = others.filter(
      (v) => v.category.toLowerCase() === video.category.toLowerCase()
    );
    const diffCat = others.filter(
      (v) => v.category.toLowerCase() !== video.category.toLowerCase()
    );
    const combined = [...sameCat, ...diffCat];
    return combined.slice(0, 12);
  }, [allVideos, video]);

  // Separate Categories (Folder 📁) and Tags (Tag 🏷️) matching original site
  const categoryItems = React.useMemo(() => {
    if (video.categories && Array.isArray(video.categories) && video.categories.length > 0) {
      return video.categories;
    }
    const list = [video.category];
    if (video.tags && Array.isArray(video.tags)) {
      video.tags.slice(0, 3).forEach((t) => {
        if (!list.includes(t)) list.push(t);
      });
    }
    return list;
  }, [video]);

  const tagItems = React.useMemo(() => {
    if (!video.tags || !Array.isArray(video.tags)) return [];
    return video.tags;
  }, [video]);

  const ytMatch = video?.videoUrl?.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
  const youtubeId = ytMatch ? ytMatch[1] : null;

  return (
    <div className="watch-page-container">
      {/* Main Video Player Section */}
      <section className="player-section">
        <div className="player-inner">
          {!hasUserStartedPlay ? (
            <div 
              className="theater-poster-preview"
              onClick={() => setHasUserStartedPlay(true)}
              style={{
                position: "relative",
                width: "100%",
                height: "100%",
                cursor: "pointer",
                background: "#000",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden"
              }}
              title="Click to play video"
            >
              <img 
                src={video.thumbnail || FALLBACK_THUMBNAIL} 
                alt={cleanTitle} 
                onError={(e) => { e.currentTarget.src = FALLBACK_THUMBNAIL; }}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  filter: "brightness(0.85)"
                }}
              />
              {/* Viralkand-style Large Centered Play Button */}
              <div 
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "14px",
                  zIndex: 2
                }}
              >
                <div 
                  style={{
                    width: "74px",
                    height: "74px",
                    borderRadius: "50%",
                    background: "rgba(220, 38, 38, 0.95)",
                    boxShadow: "0 0 35px rgba(220, 38, 38, 0.8)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    transform: "scale(1)",
                    transition: "transform 0.2s ease, box-shadow 0.2s ease"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.08)"}
                  onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
                >
                  <Play size={38} fill="#fff" style={{ marginLeft: "4px" }} />
                </div>
                <span 
                  style={{
                    background: "rgba(0, 0, 0, 0.8)",
                    color: "#fff",
                    padding: "6px 16px",
                    borderRadius: "20px",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    letterSpacing: "0.5px",
                    border: "1px solid rgba(255, 255, 255, 0.2)"
                  }}
                >
                  PLAY VIDEO ({video.duration || "03:30"})
                </span>
              </div>
            </div>
          ) : youtubeId ? (
            <div className="youtube-player-frame-wrap" style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#000" }}>
              <iframe
                src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0`}
                title={cleanTitle}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
              />
            </div>
          ) : isEmbed ? (
            <div className="youtube-player-frame-wrap" style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#000" }}>
              <iframe
                src={embedSourceUrl}
                title={cleanTitle}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="no-referrer"
                allowFullScreen
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
              />
            </div>
          ) : (
            <VideoPlayer options={{ ...playerOptions, autoplay: true, preload: "auto" }} />
          )}
        </div>
      </section>

      {/* Centered Yellow Report/Remove Button (matching Screenshot 2) */}
      <div className="report-remove-wrap">
        <button 
          className="yellow-report-btn" 
          onClick={() => {
            if (onSelectLegalPage) {
              onSelectLegalPage("dmca");
            } else {
              window.location.href = `mailto:${CONFIG.CONTACT_EMAIL}?subject=Video Removal Request`;
            }
          }}
          title="Report or request removal of this video"
        >
          Report/Remove This Video
        </button>
      </div>

      {/* Video Details & Meta Section (matching Screenshot 2) */}
      <section className="video-details-section">
        <div className="details-grid">
          {/* Left Column: Title & Description */}
          <div className="details-main">
            <h1 className="watch-title">{cleanTitle}</h1>
            <p className="watch-description-text">{video.description}</p>

            {/* Row 1: Categories with Folder Icon (matching Screenshot) */}
            {categoryItems.length > 0 && (
              <div className="meta-pills-row categories-row">
                {categoryItems.map((cat, idx) => (
                  <button 
                    key={`cat-${idx}`} 
                    className="ref-pill-btn category-pill" 
                    onClick={() => onSelectCategory && onSelectCategory(cat)}
                    title={`View ${cat} category`}
                  >
                    <Folder size={13} className="pill-icon folder-icon" />
                    <span>{cat}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Row 2: Tags with Price Tag Icon (matching Screenshot) */}
            {tagItems.length > 0 && (
              <div className="meta-pills-row tags-row">
                {tagItems.map((tag, idx) => (
                  <button 
                    key={`tag-${idx}`} 
                    className="ref-pill-btn tag-pill" 
                    onClick={() => onSelectCategory && onSelectCategory(tag)}
                    title={`View #${tag}`}
                  >
                    <Tag size={13} className="pill-icon tag-icon" />
                    <span>{tag.toLowerCase()}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Exact Reference Views & Rating Boxes (matching Screenshot 2) */}
          <div className="details-sidebar-boxes">
            {/* Box 1: Clean Views Box */}
            <div className="ref-views-box">
              <span className="ref-views-num">{video.views.toLocaleString()}</span>
              <span className="ref-views-sub">views</span>
            </div>

            {/* Box 2: Clean Thumbs Rating Box */}
            <div className="ref-rating-box">
              <div className="ref-vote-row">
                <button 
                  className={`ref-vote-icon-btn ${userVote === "like" ? "voted-like" : ""}`}
                  onClick={() => handleVote("like")}
                  title="Like"
                >
                  <ThumbsUp size={24} />
                </button>

                <span className="ref-vote-counts">
                  {likes} / {dislikes}
                </span>

                <button 
                  className={`ref-vote-icon-btn ${userVote === "dislike" ? "voted-dislike" : ""}`}
                  onClick={() => handleVote("dislike")}
                  title="Dislike"
                >
                  <ThumbsDown size={24} />
                </button>
              </div>

              <div className="ref-rating-meter-bar">
                <div 
                  className="ref-rating-meter-fill" 
                  style={{ width: `${likePercent}%` }} 
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Related Videos Suggestion Section (Exact Style as Screenshot) */}
      <section className="related-videos-section">

        {/* Big Centered Section Heading */}
        <h2 className="related-title">More Viral & Recommended Videos</h2>

        {/* 6-Column Grid */}
        <div className="related-6col-grid">
          {relatedVideosList.map((item, index) => (
            <VideoCard 
              key={`${item.id}-${index}`} 
              video={item} 
              onSelectVideo={onSelectVideo} 
            />
          ))}
        </div>

        {/* Black "Show More" Button linking to Category Page */}
        <div className="show-more-wrap">
          <button 
            className="show-more-black-btn"
            onClick={() => onSelectCategory(video.category)}
            title={`View all ${video.category} videos`}
          >
            Show More {video.category} Videos
          </button>
        </div>

        {/* Footer Section matching exact reference */}
        <footer className="suggestion-footer">
          <div className="footer-links-row">
            <button className="footer-nav-link" onClick={() => onSelectLegalPage && onSelectLegalPage("dmca")}>
              DMCA — Remove A Video
            </button>
            <span className="sep-divider">|</span>
            <button className="footer-nav-link" onClick={() => onSelectLegalPage && onSelectLegalPage("compliance")}>
              18 U.S.C 2257
            </button>
            <span className="sep-divider">|</span>
            <button className="footer-nav-link" onClick={() => onSelectLegalPage && onSelectLegalPage("terms")}>
              Terms of Use
            </button>
          </div>
          <p className="footer-copyright-text">
            © 2026 - VIRALKAM.COM. All rights reserved.
          </p>
        </footer>
      </section>
    </div>
  );
}
