import React, { useState } from "react";
import { X, Upload, Film, Image, Tag, Folder } from "lucide-react";

export default function UploadModal({ isOpen, onClose, onAddVideo, categories }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Nature");
  const [videoUrl, setVideoUrl] = useState("");
  const [thumbnail, setThumbnail] = useState("");
  const [duration, setDuration] = useState("04:30");
  const [tags, setTags] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newVideo = {
      id: "vid-" + Date.now(),
      title: title.trim(),
      description: description.trim() || "Uploaded video content on ViralTube platform.",
      duration: duration.trim() || "03:45",
      views: 1,
      likes: 1,
      dislikes: 0,
      rating: 100,
      category: category,
      tags: tags
        ? tags.split(",").map((t) => t.trim()).filter(Boolean)
        : [category, "Viral", "Trending"],
      uploadedAt: "Just now",
      author: "You",
      thumbnail: thumbnail.trim() || "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=800&auto=format&fit=crop&q=80",
      videoUrl: videoUrl.trim() || "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
    };

    onAddVideo(newVideo);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-title">
            <Upload size={20} className="modal-header-icon" />
            <h2>Upload / Add Video</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Video Title *</label>
            <input
              type="text"
              placeholder="e.g. 4K Drone Flight Over Tropical Waterfall"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              rows={3}
              placeholder="Provide a detailed description of the video..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="form-row">
            <div className="form-group flex-1">
              <label>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories
                  .filter((c) => c !== "All" && c !== "Trending")
                  .map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
              </select>
            </div>

            <div className="form-group flex-1">
              <label>Duration (MM:SS)</label>
              <input
                type="text"
                placeholder="05:20"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Direct Video URL (MP4 / WebM / HLS)</label>
            <input
              type="url"
              placeholder="https://commondatastorage.googleapis.com/.../sample.mp4"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
            />
            <span className="field-hint">Leave blank to use default test video stream</span>
          </div>

          <div className="form-group">
            <label>Thumbnail Image URL</label>
            <input
              type="url"
              placeholder="https://images.unsplash.com/..."
              value={thumbnail}
              onChange={(e) => setThumbnail(e.target.value)}
            />
            <span className="field-hint">Leave blank for automatic placeholder thumbnail</span>
          </div>

          <div className="form-group">
            <label>Tags (Comma separated)</label>
            <input
              type="text"
              placeholder="4K, Drone, Nature, Cinematic"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-submit">
              <Upload size={16} />
              <span>Publish Video</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
