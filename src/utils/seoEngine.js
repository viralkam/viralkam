/**
 * VIRALKAAM SEO, AEO, and GEO Automatic Generation Engine
 *
 * - Auto-Categorization & Tag Extraction from Video Title, Description & Existing Tags
 * - SEO (Search Engine Optimization): Google/Bing meta titles, descriptions, OpenGraph, Twitter Cards.
 * - AEO (Answer Engine Optimization): AI Answer Engines (Perplexity, ChatGPT, Google AI Overviews) Q&A and declarative summaries.
 * - GEO (Generative Engine Optimization): LLM entity relationships, citation anchors, and Schema.org VideoObject JSON-LD.
 */

// Clean readable title even if URL or filename was entered
export function cleanSeoTitleText(rawTitle = "") {
  let t = String(rawTitle || "").trim();
  if (t.startsWith("http://") || t.startsWith("https://")) {
    try {
      const cleanUrl = t.replace(/(https?:\/\/[^\s]+)(https?:\/\/)/i, "$1");
      const parts = cleanUrl.split("/");
      const lastPart = parts[parts.length - 1] || "";
      const withoutExt = decodeURIComponent(lastPart).replace(/\.[a-zA-Z0-9]+$/, "");
      t = withoutExt.replace(/[-_+]/g, " ").replace(/\s+/g, " ").trim();
    } catch {}
  } else {
    t = t.replace(/\.(mp4|webm|mkv|mov|avi)$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  }
  return t.replace(/\b(480p?|720p?|1080p?|r2)\b$/i, "").trim() || "Trending Viral Video";
}

// Category detection rules (ordered by specificity)
const CATEGORY_RULES = [
  {
    name: "Webseries",
    keywords: ["webseries", "web series", "ullu", "kooku", "altbalaji", "episode", "series", "full movie", "movie"]
  },
  {
    name: "MMS",
    keywords: ["mms", "leaked", "scandal", "hidden", "private", "cam", "caught", "viral mms"]
  },
  {
    name: "Regional",
    keywords: ["tamil", "telugu", "mallu", "malayalam", "bengali", "bhojpuri", "punjabi", "marathi", "gujarati", "kannada", "south", "pakistani", "nepali"]
  },
  {
    name: "Shorts",
    keywords: ["shorts", "short", "reel", "reels", "insta", "instagram", "tiktok", "clip", "status"]
  },
  {
    name: "Couple",
    keywords: ["couple", "wife", "husband", "gf", "bf", "girlfriend", "boyfriend", "married", "honeymoon", "romance", "romantic", "lover", "newly married", "suhagrat"]
  },
  {
    name: "Bhabhi",
    keywords: ["bhabhi", "devar", "aunty", "aunt", "milf", "padosan", "chachi", "mami"]
  },
  {
    name: "College",
    keywords: ["college", "hostel", "student", "school", "teen", "campus", "tuition", "teacher"]
  },
  {
    name: "Desi",
    keywords: ["desi", "indian", "hindi", "gaon", "village", "dehati", "bharat", "hindustani"]
  },
  {
    name: "Trending",
    keywords: ["trending", "latest", "2026", "2025", "new", "hot", "top"]
  },
  {
    name: "Viral",
    keywords: ["viral", "popular", "best", "full", "hd", "4k", "exclusive"]
  }
];

const TAG_RULES = [
  { tag: "Desi", keywords: ["desi", "indian", "gaon", "village", "dehati"] },
  { tag: "Hindi", keywords: ["hindi", "hindi audio", "desi"] },
  { tag: "Indian", keywords: ["indian", "desi", "bharat"] },
  { tag: "MMS", keywords: ["mms", "leaked", "scandal", "hidden"] },
  { tag: "Couple", keywords: ["couple", "gf", "bf", "girlfriend", "boyfriend", "wife", "husband", "married"] },
  { tag: "Bhabhi", keywords: ["bhabhi", "devar", "aunty", "milf"] },
  { tag: "College", keywords: ["college", "hostel", "student", "campus"] },
  { tag: "Webseries", keywords: ["webseries", "web series", "episode", "series", "ullu"] },
  { tag: "Shorts", keywords: ["shorts", "reel", "reels", "insta", "clip"] },
  { tag: "Regional", keywords: ["tamil", "telugu", "mallu", "bengali", "punjabi", "marathi", "bhojpuri", "south"] },
  { tag: "Tamil", keywords: ["tamil"] },
  { tag: "Mallu", keywords: ["mallu", "malayalam"] },
  { tag: "Punjabi", keywords: ["punjabi"] },
  { tag: "Bengali", keywords: ["bengali"] },
  { tag: "Pakistani", keywords: ["pakistani", "pakistan"] },
  { tag: "Romance", keywords: ["romance", "romantic", "honeymoon", "lover"] },
  { tag: "Trending", keywords: ["trending", "latest", "new", "2025", "2026"] },
  { tag: "Viral", keywords: ["viral", "popular", "exclusive"] },
  { tag: "HD", keywords: ["hd", "4k", "full", "uhd"] }
];

function parseDurationSeconds(durationStr) {
  if (!durationStr) return 0;
  const parts = String(durationStr).split(":").map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

/**
 * Automatically derives Category & clean Tags from video title, description, existing tags & duration
 */
export function extractCategoryAndTagsFromTitle({
  title = "",
  description = "",
  category = "",
  tags = [],
  duration = "",
  forceReclassify = false
}) {
  const cleanTitle = cleanSeoTitleText(title);
  const existingTagsArr = Array.isArray(tags)
    ? tags
    : typeof tags === "string"
      ? (() => {
          try {
            const p = JSON.parse(tags);
            return Array.isArray(p) ? p : tags.split(",");
          } catch {
            return tags.split(",");
          }
        })()
      : [];

  const combinedText = `${cleanTitle} ${description || ""} ${existingTagsArr.join(" ")}`.toLowerCase();

  // 1. Determine Category
  let resolvedCategory = (category || "").trim();
  const isGenericCat = !resolvedCategory || resolvedCategory.toLowerCase() === "general";

  if (isGenericCat || forceReclassify) {
    let matchedCat = "";
    for (const rule of CATEGORY_RULES) {
      if (rule.keywords.some((kw) => combinedText.includes(kw))) {
        matchedCat = rule.name;
        break;
      }
    }
    if (!matchedCat) {
      const secs = parseDurationSeconds(duration);
      if (secs > 0 && secs <= 65) {
        matchedCat = "Shorts";
      } else {
        matchedCat = "Viral";
      }
    }
    resolvedCategory = matchedCat;
  }

  // 2. Build clean deduplicated Tag list
  const tagMap = new Map();
  const addTag = (raw) => {
    const t = String(raw || "").replace(/^#/, "").trim();
    if (!t || t.length < 2 || t.length > 32) return;
    const low = t.toLowerCase();
    if (low === "general" || low === "viralkam" || low === "viralkaam" || low === "null") return;
    if (!tagMap.has(low)) {
      tagMap.set(low, t);
    }
  };

  // Always include the resolved Category as primary tag
  addTag(resolvedCategory);

  // Match structured tags from title/description
  for (const rule of TAG_RULES) {
    if (rule.keywords.some((kw) => combinedText.includes(kw))) {
      addTag(rule.tag);
    }
  }

  // Preserve valid existing tags
  for (const t of existingTagsArr) {
    addTag(t);
  }

  // Guarantee at least 3 useful tags
  if (tagMap.size < 3) addTag("Viral");
  if (tagMap.size < 3) addTag("Trending");
  if (tagMap.size < 3) addTag("HD");

  const resolvedTags = Array.from(tagMap.values()).slice(0, 7);

  return {
    cleanTitle,
    category: resolvedCategory,
    tags: resolvedTags
  };
}

// Helper to convert MM:SS to ISO 8601 duration (e.g., "04:20" -> "PT4M20S")
export function formatISO8601Duration(durationStr) {
  if (!durationStr) return "";
  const parts = String(durationStr).split(":").map(Number);
  if (parts.some(isNaN)) return "";
  if (parts.length === 2) {
    return `PT${parts[0]}M${parts[1]}S`;
  } else if (parts.length === 3) {
    return `PT${parts[0]}H${parts[1]}M${parts[2]}S`;
  }
  return "";
}

/**
 * Automatically generates complete SEO, AEO, and GEO metadata for any video from Title, Category & Tags
 */
export function generateVideoSEO_AEO_GEO({
  id = "vid-" + Date.now(),
  title = "",
  description = "",
  category = "General",
  tags = [],
  duration = "",
  thumbnail = "",
  videoUrl = "",
  views = 0,
  forceReclassify = false
}) {
  const { cleanTitle, category: cleanCategory, tags: tagList } = extractCategoryAndTagsFromTitle({
    title,
    description,
    category,
    tags,
    duration,
    forceReclassify
  });

  // 1. SEO GENERATION (Google / Bing / Social)
  const seoTitle = `${cleanTitle} - Full HD ${cleanCategory} Video | VIRALKAAM`;
  const rawDesc = String(description || "").trim();
  const isGenericDesc = !rawDesc || rawDesc.toLowerCase().startsWith("watch full video on") || rawDesc.toLowerCase().startsWith("watch video on");
  const seoDescription = !isGenericDesc
    ? (rawDesc.length > 158 ? rawDesc.substring(0, 155) + "..." : rawDesc)
    : `Watch ${cleanTitle} online in Full HD on VIRALKAAM. Category: ${cleanCategory}. Tags: ${tagList.slice(0, 4).join(", ")}. Fast free streaming.`;
  const canonicalUrl = `https://viralkaam.com/?v=${id}`;

  // 2. AEO GENERATION (Answer Engine Optimization for Perplexity, ChatGPT Search, Claude, Google AI Overviews)
  const aeoSummary = `"${cleanTitle}" is a featured ${cleanCategory} video on VIRALKAAM.COM tagged with ${tagList.join(", ")}. Streamed in high definition${duration ? ` with a runtime of ${duration}` : ""} for instant playback.`;

  const aeoKeyFacts = [
    {
      question: `What is "${cleanTitle}" about?`,
      answer: `${cleanTitle} is a popular ${cleanCategory} video featuring ${tagList.slice(0, 4).join(", ")} content streaming in HD on VIRALKAAM.`
    },
    {
      question: `Which category and tags belong to "${cleanTitle}"?`,
      answer: `It belongs to the ${cleanCategory} category with tags: ${tagList.join(", ")}.`
    },
    {
      question: `Where can I watch "${cleanTitle}"?`,
      answer: `Available for free high-speed streaming on VIRALKAAM.COM without paywalls.`
    },
    {
      question: `What is the duration of this video?`,
      answer: duration ? `The total video duration is ${duration} with instant player load.` : `Instant high-performance HD streaming.`
    }
  ];

  // 3. GEO GENERATION (Generative Engine Optimization for LLMs: Gemini, ChatGPT, Perplexity, Copilot)
  const geoEntities = Array.from(
    new Set([
      "VIRALKAAM",
      "VIRALKAAM.COM",
      cleanCategory,
      ...tagList,
      "HD Video Streaming",
      "Digital Media Streaming"
    ])
  );

  // Schema.org VideoObject JSON-LD
  const isoDuration = formatISO8601Duration(duration);
  const schemaJsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    "@id": `https://viralkaam.com/?v=${id}#video`,
    "name": seoTitle,
    "description": seoDescription,
    "thumbnailUrl": [
      thumbnail || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1280&h=720&auto=format&fit=crop&q=80"
    ],
    "uploadDate": new Date().toISOString(),
    "duration": isoDuration,
    "contentUrl": videoUrl || "",
    "embedUrl": `https://viralkaam.com/?v=${id}`,
    "genre": cleanCategory,
    "keywords": geoEntities.join(", "),
    "publisher": {
      "@type": "Organization",
      "name": "VIRALKAAM",
      "url": "https://viralkaam.com",
      "logo": {
        "@type": "ImageObject",
        "url": "https://viralkaam.com/favicon.svg"
      }
    },
    "interactionStatistic": {
      "@type": "InteractionCounter",
      "interactionType": { "@type": "WatchAction" },
      "userInteractionCount": Number(views || 0)
    }
  };

  return {
    category: cleanCategory,
    tags: tagList,
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

  if (seoData.seoTitle) {
    document.title = seoData.seoTitle;
  }

  const setMeta = (attr, key, content) => {
    let elem = document.querySelector(`meta[${attr}="${key}"]`);
    if (!elem) {
      elem = document.createElement("meta");
      elem.setAttribute(attr, key);
      document.head.appendChild(elem);
    }
    elem.setAttribute("content", content);
  };

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

  let parsedSchema = seoData.schemaJsonLd;
  if (typeof parsedSchema === "string") {
    try {
      parsedSchema = JSON.parse(parsedSchema);
    } catch {
      parsedSchema = null;
    }
  }

  if (parsedSchema?.thumbnailUrl?.[0]) {
    setMeta("property", "og:image", parsedSchema.thumbnailUrl[0]);
    setMeta("name", "twitter:image", parsedSchema.thumbnailUrl[0]);
  }

  setMeta("property", "og:site_name", "VIRALKAAM");
  setMeta("property", "og:type", "video.other");

  if (parsedSchema) {
    let scriptElem = document.getElementById("viralkaam-dynamic-jsonld");
    if (!scriptElem) {
      scriptElem = document.createElement("script");
      scriptElem.id = "viralkaam-dynamic-jsonld";
      scriptElem.type = "application/ld+json";
      document.head.appendChild(scriptElem);
    }
    scriptElem.textContent = JSON.stringify(parsedSchema, null, 2);
  }
}

/**
 * Reset head tags back to default VIRALKAAM Home state
 */
export function resetSEOToHome() {
  document.title = "VIRALKAAM.COM - Top Viral & Trending Videos Free Streaming";

  let scriptElem = document.getElementById("viralkaam-dynamic-jsonld");
  if (scriptElem) {
    scriptElem.remove();
  }

  const descElem = document.querySelector('meta[name="description"]');
  if (descElem) {
    descElem.setAttribute(
      "content",
      "VIRALKAAM.COM is the ultimate high-performance video streaming platform delivering daily updated viral videos, 4K HD trending clips, and categories."
    );
  }
}
