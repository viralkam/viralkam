import React, { useState, useEffect, useRef } from "react";
import { Search, Menu, X } from "lucide-react";

export default function Navbar({
  searchQuery,
  setSearchQuery,
  onNavigateHome,
  onOpenAdmin,
  isAdminActive,
  categories = [],
  activeCategory = null,
  onSelectCategory,
  tags = [],
  activeTag = null,
  onSelectTag,
  activeFilter,
  setActiveFilter
}) {
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showCategoriesDropdown, setShowCategoriesDropdown] = useState(false);
  const [showTagsDropdown, setShowTagsDropdown] = useState(false);
  const navRef = useRef(null);

  const filterOptions = [
    { id: "newest", label: "Newest" },
    { id: "popular", label: "Popular" },
    { id: "most_viewed", label: "Most viewed" },
    { id: "longest", label: "Longest" },
    { id: "random", label: "Random" }
  ];

  // Close desktop dropdowns on outside click / tap
  useEffect(() => {
    const handleOutside = (e) => {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setShowCategoriesDropdown(false);
        setShowTagsDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, []);

  // Prevent background body scroll when mobile drawer is open
  useEffect(() => {
    if (showMobileMenu) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [showMobileMenu]);

  return (
    <header className="site-header" ref={navRef}>
      <div className="header-inner">
        {/* Logo / Branding */}
        <div
          className="site-branding"
          onClick={() => {
            onNavigateHome();
            setShowMobileMenu(false);
            setShowCategoriesDropdown(false);
            setShowTagsDropdown(false);
          }}
          title="Go to Home"
        >
          <h1 className="site-title">VIRALKAAM.COM</h1>
        </div>

        {/* Right side items */}
        <div className="header-right-controls">
          {/* Search Icon / Expand Box */}
          <div className="header-search-container">
            {showSearchInput ? (
              <div className="search-expanding-box">
                <input
                  type="text"
                  placeholder="Search videos..."
                  value={searchQuery}
                  onChange={(e) => {
                    const val = e.target.value;
                    const cleanVal = val.trim().toLowerCase();
                    if (cleanVal === "/adminenable" || cleanVal === "/admin") {
                      setSearchQuery("");
                      setShowSearchInput(false);
                      setShowMobileMenu(false);
                      onOpenAdmin();
                    } else {
                      setSearchQuery(val);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const cleanVal = searchQuery.trim().toLowerCase();
                      if (cleanVal === "/adminenable" || cleanVal === "/admin") {
                        e.preventDefault();
                        setSearchQuery("");
                        setShowSearchInput(false);
                        setShowMobileMenu(false);
                        onOpenAdmin();
                      }
                    }
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  className="search-close-x"
                  onClick={() => {
                    setShowSearchInput(false);
                    setSearchQuery("");
                  }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="header-icon-btn search-toggle"
                onClick={() => {
                  setShowSearchInput(true);
                  setShowMobileMenu(false);
                }}
                title="Search"
                aria-label="Open Search"
              >
                <Search size={22} />
              </button>
            )}
          </div>

          {/* Desktop Navigation Links */}
          <nav className="desktop-header-nav">
            {/* Categories Dropdown */}
            <div className="nav-dropdown-wrapper">
              <button
                type="button"
                className="nav-text-link"
                onClick={() => {
                  setShowCategoriesDropdown((prev) => !prev);
                  setShowTagsDropdown(false);
                }}
              >
                Categories
              </button>
              {showCategoriesDropdown && (
                <div className="categories-menu-dropdown">
                  {categories.length > 0 ? (
                    categories.map((cat) => (
                      <button
                        type="button"
                        key={cat}
                        className={`cat-dropdown-item ${activeCategory === cat ? "active" : ""}`}
                        onClick={() => {
                          onSelectCategory(cat);
                          setShowCategoriesDropdown(false);
                        }}
                      >
                        {cat}
                      </button>
                    ))
                  ) : (
                    <div style={{ padding: "8px 12px", color: "#94a3b8", fontSize: "0.8rem" }}>
                      No categories in Admin Panel
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Tags Dropdown */}
            <div className="nav-dropdown-wrapper">
              <button
                type="button"
                className="nav-text-link"
                onClick={() => {
                  setShowTagsDropdown((prev) => !prev);
                  setShowCategoriesDropdown(false);
                }}
              >
                Tags
              </button>
              {showTagsDropdown && (
                <div className="categories-menu-dropdown tags-menu-dropdown">
                  {tags.length > 0 ? (
                    tags.map((t) => {
                      const name = typeof t === "string" ? t : t.name;
                      return (
                        <button
                          type="button"
                          key={name}
                          className={`cat-dropdown-item ${activeTag === name ? "active" : ""}`}
                          onClick={() => {
                            if (onSelectTag) onSelectTag(name);
                            setShowTagsDropdown(false);
                          }}
                        >
                          #{name}
                        </button>
                      );
                    })
                  ) : (
                    <div style={{ padding: "8px 12px", color: "#94a3b8", fontSize: "0.8rem" }}>
                      No tags in Admin Panel
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Home Black Pill */}
            <button
              type="button"
              className={`nav-pill-btn home-pill ${!isAdminActive ? "active" : ""}`}
              onClick={() => {
                onNavigateHome();
                setShowCategoriesDropdown(false);
                setShowTagsDropdown(false);
              }}
            >
              Home
            </button>
          </nav>

          {/* Mobile Hamburger Button */}
          <button
            type="button"
            className="mobile-hamburger-btn"
            onClick={(e) => {
              e.stopPropagation();
              setShowMobileMenu((prev) => !prev);
            }}
            aria-label="Toggle Navigation Menu"
            aria-expanded={showMobileMenu}
          >
            {showMobileMenu ? <X size={26} /> : <Menu size={26} />}
          </button>
        </div>
      </div>

      {/* Mobile Full-Overlay Backdrop + Scrollable Drawer Menu */}
      {showMobileMenu && (
        <>
          <div
            className="mobile-drawer-backdrop"
            onClick={() => setShowMobileMenu(false)}
          />
          <nav className="mobile-nav-drawer" aria-label="Mobile Navigation">
            <ul className="mobile-menu-list">
              <li>
                <button
                  type="button"
                  className={`mobile-drawer-link highlight ${!activeCategory && !activeTag && activeFilter === "newest" ? "active-filter" : ""}`}
                  onClick={() => {
                    onNavigateHome();
                    setShowMobileMenu(false);
                  }}
                >
                  Home
                </button>
              </li>

              <li className="mobile-menu-divider">Sort &amp; Filters</li>
              {filterOptions.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    className={`mobile-drawer-link ${!activeCategory && !activeTag && activeFilter === f.id ? "active-filter" : ""}`}
                    onClick={() => {
                      if (setActiveFilter) setActiveFilter(f.id);
                      setShowMobileMenu(false);
                    }}
                  >
                    {f.label}
                  </button>
                </li>
              ))}

              <li className="mobile-menu-divider">Categories ({categories.length})</li>
              {categories.length > 0 ? (
                categories.map((cat) => (
                  <li key={cat}>
                    <button
                      type="button"
                      className={`mobile-drawer-link ${activeCategory === cat ? "active-filter" : ""}`}
                      onClick={() => {
                        onSelectCategory(cat);
                        setShowMobileMenu(false);
                      }}
                    >
                      {cat}
                    </button>
                  </li>
                ))
              ) : (
                <li style={{ padding: "8px 1.5rem", color: "rgba(255,255,255,0.6)", fontSize: "0.85rem" }}>
                  No categories added in Admin Panel
                </li>
              )}

              <li className="mobile-menu-divider">Tags ({tags.length})</li>
              {tags.length > 0 ? (
                tags.map((t) => {
                  const name = typeof t === "string" ? t : t.name;
                  return (
                    <li key={name}>
                      <button
                        type="button"
                        className={`mobile-drawer-link ${activeTag === name ? "active-filter" : ""}`}
                        onClick={() => {
                          if (onSelectTag) onSelectTag(name);
                          setShowMobileMenu(false);
                        }}
                      >
                        #{name}
                      </button>
                    </li>
                  );
                })
              ) : (
                <li style={{ padding: "8px 1.5rem", color: "rgba(255,255,255,0.6)", fontSize: "0.85rem" }}>
                  No tags added in Admin Panel
                </li>
              )}
            </ul>
          </nav>
        </>
      )}
    </header>
  );
}
