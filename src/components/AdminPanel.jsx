import React, { useState, useMemo, useEffect } from "react";
import { 
  Upload, 
  Film, 
  Trash2, 
  Eye, 
  EyeOff,
  ArrowLeft, 
  PlusCircle, 
  BarChart3, 
  CheckCircle2, 
  Clock, 
  ListVideo,
  Sparkles,
  Globe,
  Bot,
  Search,
  Check,
  Lock,
  ShieldCheck,
  LogOut,
  AlertCircle
} from "lucide-react";
import { generateVideoSEO_AEO_GEO } from "../utils/seoEngine";
import { api } from "../services/api";

export default function AdminPanel({
  videos,
  categories,
  onAddVideo,
  onDeleteVideo,
  onExitAdmin,
  onViewVideo
}) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(api.getAdminToken()));
  const [adminId, setAdminId] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [activeTab, setActiveTab] = useState("upload"); // "upload" | "manage"

  // Verify stored token on mount
  useEffect(() => {
    async function checkToken() {
      if (api.getAdminToken()) {
        const isValid = await api.verifyAdmin();
        if (!isValid) {
          api.clearAdminToken();
          setIsAuthenticated(false);
        }
      }
    }
    checkToken();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError("");
    setIsLoggingIn(true);
    try {
      const res = await api.loginAdmin(adminId, adminPass);
      if (res && res.token) {
        api.setAdminToken(res.token, rememberMe);
        setIsAuthenticated(true);
        setAdminPass("");
      }
    } catch (err) {
      setLoginError(err.message || "Invalid Admin ID or Password. Access Denied.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    api.clearAdminToken();
    setIsAuthenticated(false);
  };

  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(categories[0] || "General");
  const [videoUrl, setVideoUrl] = useState("");
  const [thumbnail, setThumbnail] = useState("");
  const [duration, setDuration] = useState("04:20");
  const [tags, setTags] = useState("");
  const [viewsInitial, setViewsInitial] = useState(0);
  const [ratingInitial, setRatingInitial] = useState(95);
  const [publishSuccess, setPublishSuccess] = useState(false);

  // Live Auto-Generated SEO, AEO, and GEO Engine State
  const autoSeoData = useMemo(() => {
    return generateVideoSEO_AEO_GEO({
      title: title || "New Viral Video",
      description: description,
      category: category,
      tags: tags,
      duration: duration || "03:30",
      thumbnail: thumbnail,
      videoUrl: videoUrl
    });
  }, [title, description, category, tags, duration, thumbnail, videoUrl]);

  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");

  // Statistics
  const totalViews = videos.reduce((sum, v) => sum + (v.views || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setPublishError("");
    setIsPublishing(true);

    const rawUrl = videoUrl.trim();
    // Auto-detect YouTube URL
    const ytMatch = rawUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
    const ytId = ytMatch ? ytMatch[1] : null;

    // Auto-generate high-quality thumbnail from YouTube if not specified
    let finalThumbnail = thumbnail.trim();
    if (!finalThumbnail && ytId) {
      finalThumbnail = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
    } else if (!finalThumbnail) {
      finalThumbnail = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80";
    }

    // Automatic SEO, AEO, GEO compilation
    const seoAeoGeo = generateVideoSEO_AEO_GEO({
      id: "vid-" + Date.now(),
      title: title.trim(),
      description: description.trim(),
      category: category,
      tags: tags,
      duration: duration.trim() || "03:30",
      thumbnail: finalThumbnail,
      videoUrl: rawUrl
    });

    const newVideo = {
      id: "vid-" + Date.now(),
      title: title.trim(),
      description: description.trim() || "Watch full video on VIRALKAM.COM.",
      duration: duration.trim() || "03:30",
      views: parseInt(viewsInitial) || 0,
      likes: Math.round(((parseInt(viewsInitial) || 0) * (ratingInitial / 100)) / 10) || 10,
      dislikes: 1,
      rating: parseInt(ratingInitial) || 95,
      category: category,
      tags: tags
        ? tags.split(",").map((t) => t.trim()).filter(Boolean)
        : [category, "VIRALKAM", "Viral"],
      uploadedAt: "Just now",
      author: "Admin",
      thumbnail: finalThumbnail,
      videoUrl: rawUrl || (ytId ? `https://www.youtube.com/watch?v=${ytId}` : "https://vjs.zencdn.net/v/oceans.mp4"),
      embedUrl: ytId ? `https://www.youtube.com/embed/${ytId}` : null,
      seoTitle: seoAeoGeo.seoTitle,
      seoDescription: seoAeoGeo.seoDescription,
      canonicalUrl: seoAeoGeo.canonicalUrl,
      aeoSummary: seoAeoGeo.aeoSummary,
      aeoKeyFacts: seoAeoGeo.aeoKeyFacts,
      geoEntities: seoAeoGeo.geoEntities,
      schemaJsonLd: seoAeoGeo.schemaJsonLd
    };

    try {
      await onAddVideo(newVideo);
      setPublishSuccess(true);
      setTitle("");
      setDescription("");
      setVideoUrl("");
      setThumbnail("");
      setTags("");

      setTimeout(() => {
        setPublishSuccess(false);
        setActiveTab("manage");
      }, 1200);
    } catch (err) {
      setPublishError(err.message || "Failed to publish video to Cloudflare D1.");
    } finally {
      setIsPublishing(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="admin-login-wrapper">
        <div className="admin-login-box">
          <div className="admin-login-badge">
            <div className="admin-login-icon-ring">
              <Lock size={32} />
            </div>
            <h2>Admin Portal</h2>
          </div>

          {loginError && (
            <div className="admin-login-error">
              <AlertCircle size={18} />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="admin-login-form">
            <div className="admin-login-field">
              <label>Admin ID</label>
              <input
                type="text"
                required
                autoFocus
                placeholder="Enter Admin ID"
                value={adminId}
                onChange={(e) => setAdminId(e.target.value)}
              />
            </div>

            <div className="admin-login-field">
              <label>Password</label>
              <div className="admin-password-wrap">
                <input
                  type={showPass ? "text" : "password"}
                  required
                  placeholder="Enter secret password"
                  value={adminPass}
                  onChange={(e) => setAdminPass(e.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPass(!showPass)}
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="admin-login-options">
              <label className="admin-remember-label">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Remember this device for 30 days</span>
              </label>
            </div>

            <button
              type="submit"
              className="admin-login-submit-btn"
              disabled={isLoggingIn}
            >
              <ShieldCheck size={18} />
              <span>{isLoggingIn ? "Authenticating..." : "Sign In to Admin Portal"}</span>
            </button>
          </form>

          <div className="admin-login-footer">
            <button className="admin-return-btn" onClick={onExitAdmin}>
              <ArrowLeft size={15} />
              <span>Return to Public Website</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-wrapper">
      {/* Admin Header */}
      <header className="admin-header">
        <div className="admin-header-left">
          <button className="admin-back-btn" onClick={onExitAdmin}>
            <ArrowLeft size={18} />
            <span>Back to Live Website</span>
          </button>
          <div className="admin-title-badge">
            <Film size={22} />
            <h2>Video Management Portal (Admin Dashboard)</h2>
          </div>
        </div>

        <div className="admin-header-right-group">
          <div className="admin-tabs">
            <button
              className={`admin-tab-btn ${activeTab === "upload" ? "active" : ""}`}
              onClick={() => setActiveTab("upload")}
            >
              <PlusCircle size={16} />
              <span>Upload New Video</span>
            </button>
            <button
              className={`admin-tab-btn ${activeTab === "manage" ? "active" : ""}`}
              onClick={() => setActiveTab("manage")}
            >
              <ListVideo size={16} />
              <span>Manage Videos ({videos.length})</span>
            </button>
          </div>

          <button className="admin-logout-btn" onClick={handleLogout} title="Sign Out of Admin Portal">
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Admin Stats Strip */}
      <div className="admin-stats-row">
        <div className="stat-card">
          <div className="stat-icon-wrap blue">
            <Film size={22} />
          </div>
          <div className="stat-info">
            <span className="stat-number">{videos.length}</span>
            <span className="stat-label">Total Videos</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrap green">
            <Eye size={22} />
          </div>
          <div className="stat-info">
            <span className="stat-number">{totalViews.toLocaleString()}</span>
            <span className="stat-label">Total Platform Views</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrap purple">
            <BarChart3 size={22} />
          </div>
          <div className="stat-info">
            <span className="stat-number">{categories.length}</span>
            <span className="stat-label">Active Categories</span>
          </div>
        </div>
      </div>

      {/* Tab 1: Upload Video Form */}
      {activeTab === "upload" && (
        <div className="admin-card">
          <div className="admin-card-header">
            <h3>Upload & Publish New Video</h3>
            <p>Fill out the metadata below to stream your video live on the platform.</p>
          </div>

          {publishSuccess && (
            <div className="admin-alert-success">
              <CheckCircle2 size={20} />
              <span>Video successfully published to Cloudflare D1! Redirecting...</span>
            </div>
          )}

          {publishError && (
            <div className="admin-login-error" style={{ marginBottom: "1rem" }}>
              <AlertCircle size={20} />
              <span>{publishError}</span>
            </div>
          )}

          <form className="admin-form" onSubmit={handleSubmit}>
            <div className="admin-form-group">
              <label>Video Title *</label>
              <input
                type="text"
                placeholder="Enter complete video title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="admin-form-row">
              <div className="admin-form-group flex-1">
                <label>Category *</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="admin-form-group flex-1">
                <label>Duration (MM:SS) *</label>
                <input
                  type="text"
                  placeholder="e.g. 05:45"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  required
                />
              </div>

              <div className="admin-form-group flex-1">
                <label>Initial Views Count</label>
                <input
                  type="number"
                  placeholder="0"
                  value={viewsInitial}
                  onChange={(e) => setViewsInitial(e.target.value)}
                />
              </div>
            </div>

            <div className="admin-form-group">
              <label>Direct Video File URL (MP4 / WebM / HLS) *</label>
              <input
                type="url"
                placeholder="https://your-server.com/videos/video-file.mp4"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
              />
              <span className="admin-hint">
                You can host videos on your server, CDN, S3, or direct MP4 link. (Leave blank to use default demo stream)
              </span>
            </div>

            <div className="admin-form-group">
              <label>Thumbnail Image URL (16:9 Cover)</label>
              <input
                type="url"
                placeholder="https://images.unsplash.com/... or /path/to/thumb.jpg"
                value={thumbnail}
                onChange={(e) => setThumbnail(e.target.value)}
              />
              <span className="admin-hint">
                Recommended 640x360 or 1280x720 cover image.
              </span>
            </div>

            <div className="admin-form-group">
              <label>Tags (Comma separated)</label>
              <input
                type="text"
                placeholder="Action, 4K, HD, Exclusive"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </div>

            <div className="admin-form-group">
              <label>Description</label>
              <textarea
                rows={4}
                placeholder="Write video overview and synopsis..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="admin-form-actions">
              <button type="submit" className="admin-submit-btn" disabled={isPublishing}>
                <Upload size={18} />
                <span>{isPublishing ? "Saving to Cloudflare D1..." : "Publish Video Live"}</span>
              </button>
              <span className="admin-seo-note">
                ✓ Automatic SEO, AEO & GEO metadata enabled in background for fast indexing without blocks.
              </span>
            </div>
          </form>
        </div>
      )}

      {/* Tab 2: Manage Videos Table */}
      {activeTab === "manage" && (
        <div className="admin-card">
          <div className="admin-card-header">
            <h3>All Uploaded Videos ({videos.length})</h3>
            <p>Live catalog of all videos running on your platform.</p>
          </div>

          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Thumbnail</th>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Duration</th>
                  <th>Views</th>
                  <th>Rating</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {videos.map((vid) => (
                  <tr key={vid.id}>
                    <td className="cell-thumb">
                      <img src={vid.thumbnail} alt={vid.title} />
                    </td>
                    <td className="cell-title">
                      <strong>{vid.title}</strong>
                      <span className="cell-sub">{vid.uploadedAt}</span>
                    </td>
                    <td>
                      <span className="admin-cat-pill">{vid.category}</span>
                    </td>
                    <td>
                      <span className="admin-duration-pill">{vid.duration}</span>
                    </td>
                    <td>
                      <span className="cell-views">
                        <Eye size={12} />
                        {vid.views.toLocaleString()}
                      </span>
                    </td>
                    <td>{vid.rating}%</td>
                    <td className="cell-actions">
                      <button
                        className="admin-action-btn view-btn"
                        onClick={() => onViewVideo(vid)}
                        title="View on site"
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        className="admin-action-btn delete-btn"
                        onClick={() => {
                          if (window.confirm(`Delete video "${vid.title}"?`)) {
                            onDeleteVideo(vid.id);
                          }
                        }}
                        title="Delete video"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
