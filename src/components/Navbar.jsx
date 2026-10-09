import React, { useState } from "react";
import { Search, Menu, X, Settings, Home, Folder, Tag, Flame, Clock, Award } from "lucide-react";

export default function Navbar({
  searchQuery,
  setSearchQuery,
  onNavigateHome,
  onOpenAdmin,
  isAdminActive,
  categories,
  onSelectCategory,
  activeFilter,
  setActiveFilter
}) {
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showCategoriesDropdown, setShowCategoriesDropdown] = useState(false);

  const filterOptions = [
    { id: "newest", label: "Newest" },
    { id: "popular", label: "Popular" },
    { id: "most_viewed", label: "Most viewed" },
    { id: "longest", label: "Longest" },
    { id: "random", label: "Random" }
  ];

  return (
    <header className="site-header">
      <div className="header-inner">
        {/* Logo / Branding */}
        <div 
          className="site-branding" 
          onClick={() => {
            onNavigateHome();
            setShowMobileMenu(false);
          }} 
          title="Go to Home"
        >
          <h1 className="site-title">VIRALKAM.COM</h1>
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
                    if (val.trim().toLowerCase() === "/adminenable") {
                      setSearchQuery("");
                      setShowSearchInput(false);
                      onOpenAdmin();
                    } else {
                      setSearchQuery(val);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (searchQuery.trim().toLowerCase() === "/adminenable") {
                        e.preventDefault();
                        setSearchQuery("");
                        setShowSearchInput(false);
                        onOpenAdmin();
                      }
                    }
                  }}
                  autoFocus
                />
                <button
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
                className="header-icon-btn search-toggle"
                onClick={() => setShowSearchInput(true)}
                title="Search"
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
                className="nav-text-link"
                onClick={() => setShowCategoriesDropdown(!showCategoriesDropdown)}
              >
                Categories
              </button>
              {showCategoriesDropdown && (
                <div className="categories-menu-dropdown">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      className="cat-dropdown-item"
                      onClick={() => {
                        onSelectCategory(cat);
                        setShowCategoriesDropdown(false);
                      }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tags Link */}
            <button className="nav-text-link" onClick={onNavigateHome}>
              Tags
            </button>

            {/* Home Black Pill */}
            <button
              className={`nav-pill-btn home-pill ${!isAdminActive ? "active" : ""}`}
              onClick={onNavigateHome}
            >
              Home
            </button>
          </nav>

          {/* Mobile Hamburger Button (Exact as Screenshot 1) */}
          <button
            className="mobile-hamburger-btn"
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            aria-label="Toggle Navigation Menu"
          >
            {showMobileMenu ? <X size={26} /> : <Menu size={26} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Dropdown Menu */}
      {showMobileMenu && (
        <div className="mobile-nav-drawer">
          <ul className="mobile-menu-list">
            <li>
              <button 
                className="mobile-drawer-link highlight"
                onClick={() => {
                  onNavigateHome();
                  setShowMobileMenu(false);
                }}
              >
                Home
              </button>
            </li>

            <li className="mobile-menu-divider">Filters</li>
            {filterOptions.map((f) => (
              <li key={f.id}>
                <button
                  className={`mobile-drawer-link ${activeFilter === f.id ? "active-filter" : ""}`}
                  onClick={() => {
                    if (setActiveFilter) setActiveFilter(f.id);
                    onNavigateHome();
                    setShowMobileMenu(false);
                  }}
                >
                  {f.label}
                </button>
              </li>
            ))}

            <li className="mobile-menu-divider">Categories</li>
            {categories.map((cat) => (
              <li key={cat}>
                <button
                  className="mobile-drawer-link"
                  onClick={() => {
                    onSelectCategory(cat);
                    setShowMobileMenu(false);
                  }}
                >
                  {cat}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}
