/**
 * VIRALKAM SEO, AEO, and GEO Automatic Generation Engine
 * 
 * - SEO (Search Engine Optimization): Google/Bing meta titles, descriptions, OpenGraph, Twitter Cards.
 * - AEO (Answer Engine Optimization): AI Answer Engines (Perplexity, ChatGPT, Google AI Overviews) Q&A and declarative summaries.
 * - GEO (Generative Engine Optimization): LLM entity relationships, citation anchors, and Schema.org VideoObject JSON-LD.
 */

// Helper to convert MM:SS to ISO 8601 duration (e.g., "04:20" -> "PT4M20S")
export function formatISO8601Duration(durationStr) {
  if (!durationStr) return "PT3M30S";
  const parts = durationStr.split(":").map(Number);
  if (parts.length === 2) {
    return `PT${parts[0]}M${parts[1]}S`;
  } else if (parts.length === 3) {
    return `PT${parts[0]}H${parts[1]}M${parts[2]}S`;
  }
  return "PT3M30S";
}

/**
 * Automatically generates complete SEO, AEO, and GEO metadata for any video
 */
export function generateVideoSEO_AEO_GEO({
  id = "vid-" + Date.now(),
  title = "",
  description = "",
  category = "General",
  tags = [],
  duration = "03:30",
  thumbnail = "",
  videoUrl = ""
}) {
  const cleanTitle = title.trim() || "Trending Viral Video";
  const cleanCategory = category.trim() || "Viral";
  const tagList = Array.isArray(tags) ? tags : (tags ? tags.split(",").map(t => t.trim()) : []);

  // 1. SEO GENERATION (Google / Bing / Social)
  const seoTitle = `${cleanTitle} - Full HD 4K Video | VIRALKAM`;
  const seoDescription = description.trim() 
    ? (description.length > 155 ? description.substring(0, 152) + "..." : description)
    : `Watch ${cleanTitle} online in Ultra HD 4K on VIRALKAM. Explore top ${cleanCategory} viral videos, trending highlights, and high-speed streaming.`;
  const canonicalUrl = `https://viralkam.com/?v=${id}`;

  // 2. AEO GENERATION (Answer Engine Optimization for Perplexity, ChatGPT Search, Claude, Google SGE)
  const aeoSummary = `This video features "${cleanTitle}" in the ${cleanCategory} category. Streamed exclusively in high-definition on VIRALKAM.COM, it covers trending highlights with an estimated runtime of ${duration}.`;
  
  const aeoKeyFacts = [
    { question: `What is "${cleanTitle}" about?`, answer: `${cleanTitle} showcases trending ${cleanCategory} content streaming in 4K on VIRALKAM.` },
    { question: `Where can I watch "${cleanTitle}"?`, answer: `Available for free high-performance streaming on VIRALKAM.COM without paywalls.` },
    { question: `What is the duration of this video?`, answer: `The total video duration is ${duration} with instant player load.` }
  ];

  // 3. GEO GENERATION (Generative Engine Optimization for LLMs: Gemini, ChatGPT, Perplexity, Copilot)
  const geoEntities = [
    "VIRALKAM",
    "VIRALKAM.COM",
    cleanCategory,
    "Viral Video",
    "4K UHD Video Streaming",
    "Digital Media Streaming",
    ...tagList
  ];

  // Schema.org VideoObject JSON-LD
  const isoDuration = formatISO8601Duration(duration);
  const schemaJsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    "@id": `https://viralkam.com/?v=${id}#video`,
    "name": seoTitle,
    "description": seoDescription,
    "thumbnailUrl": [
      thumbnail || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1280&h=720&auto=format&fit=crop&q=80"
    ],
    "uploadDate": new Date().toISOString(),
    "duration": isoDuration,
    "contentUrl": videoUrl || "https://vjs.zencdn.net/v/oceans.mp4",
    "embedUrl": `https://viralkam.com/?v=${id}`,
    "genre": cleanCategory,
    "keywords": geoEntities.join(", "),
    "publisher": {
      "@type": "Organization",
      "name": "VIRALKAM",
      "url": "https://viralkam.com",
      "logo": {
        "@type": "ImageObject",
        "url": "https://viralkam.com/favicon.svg"
      }
    },
    "interactionStatistic": {
      "@type": "InteractionCounter",
      "interactionType": { "@type": "WatchAction" },
      "userInteractionCount": 15000
    }
  };

  return {
    seoTitle,
    seoDescription,
    canonicalUrl,
    aeoSummary,
    aeoKeyFacts,
    geoEntities,
    schemaJsonLd
  };
}

/**
 * Dynamically injects SEO, AEO, GEO tags and Schema.org JSON-LD into browser DOM head
 */
export function applySEOToHead(seoData) {
  if (!seoData) return;

  // 1. Update Title
  if (seoData.seoTitle) {
    document.title = seoData.seoTitle;
  }

  // 2. Helper to set or create meta tag
  const setMeta = (attr, key, content) => {
    let elem = document.querySelector(`meta[${attr}="${key}"]`);
    if (!elem) {
      elem = document.createElement("meta");
      elem.setAttribute(attr, key);
      document.head.appendChild(elem);
    }
    elem.setAttribute("content", content);
  };

  // 3. Set SEO meta tags
  if (seoData.seoDescription) {
    setMeta("name", "description", seoData.seoDescription);
    setMeta("property", "og:description", seoData.seoDescription);
    setMeta("name", "twitter:description", seoData.seoDescription);
  }

  if (seoData.seoTitle) {
    setMeta("property", "og:title", seoData.seoTitle);
    setMeta("name", "twitter:title", seoData.seoTitle);
  }

  if (seoData.canonicalUrl) {
    setMeta("property", "og:url", seoData.canonicalUrl);
  }

  if (seoData.schemaJsonLd?.thumbnailUrl?.[0]) {
    setMeta("property", "og:image", seoData.schemaJsonLd.thumbnailUrl[0]);
    setMeta("name", "twitter:image", seoData.schemaJsonLd.thumbnailUrl[0]);
  }

  setMeta("property", "og:site_name", "VIRALKAM");
  setMeta("property", "og:type", "video.other");

  // 4. Inject or Update Schema.org JSON-LD (AEO & GEO)
  let scriptElem = document.getElementById("viralkam-dynamic-jsonld");
  if (!scriptElem) {
    scriptElem = document.createElement("script");
    scriptElem.id = "viralkam-dynamic-jsonld";
    scriptElem.type = "application/ld+json";
    document.head.appendChild(scriptElem);
  }
  scriptElem.textContent = JSON.stringify(seoData.schemaJsonLd, null, 2);
}

/**
 * Reset head tags back to default VIRALKAM Home state
 */
export function resetSEOToHome() {
  document.title = "VIRALKAM.COM - Top Viral & Trending Videos Free Streaming";

  let scriptElem = document.getElementById("viralkam-dynamic-jsonld");
  if (scriptElem) {
    scriptElem.remove();
  }

  const descElem = document.querySelector('meta[name="description"]');
  if (descElem) {
    descElem.setAttribute("content", "VIRALKAM.COM is the ultimate high-performance video streaming platform delivering daily updated viral videos, 4K HD trending clips, and categories.");
  }
}
