import React, { useState, useEffect } from "react";
import VideoPlayer from "./VideoPlayer";
import VideoCard from "./VideoCard";
import { 
  ThumbsUp, 
  ThumbsDown, 
  Eye, 
  Tag,
  Folder,
  Sparkles,
  Bot,
  Globe
} from "lucide-react";
import { 
  generateVideoSEO_AEO_GEO, 
  applySEOToHead, 
  resetSEOToHome 
} from "../utils/seoEngine";
import { api } from "../services/api";

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

  const playerOptions = {
    autoplay: false,
    controls: true,
    responsive: true,
    fluid: true,
    poster: video.thumbnail,
    sources: [
      {
        src: video.videoUrl,
        type: "video/mp4"
      }
    ]
  };

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

  return (
    <div className="watch-page-container">
      {/* Main Video Player Section */}
      <section className="player-section">
        <div className="player-inner">
          <VideoPlayer options={playerOptions} />
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
              window.location.href = "mailto:viralkam.com@gmail.com?subject=Video Removal Request";
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
            <h1 className="watch-title">{video.title}</h1>
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
