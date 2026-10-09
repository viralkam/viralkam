import React from "react";

export default function Sidebar({
  activeFilter,
  setActiveFilter,
  activeCategory,
  setActiveCategory,
  categories,
  onResetToHome
}) {
  const filterOptions = [
    { id: "newest", label: "Newest" },
    { id: "popular", label: "Popular" },
    { id: "most_viewed", label: "Most viewed" },
    { id: "longest", label: "Longest" },
    { id: "random", label: "Random" }
  ];

  return (
    <aside className="site-sidebar">
      <div className="sidebar-section">
        <ul className="sidebar-menu">
          {filterOptions.map((item) => (
            <li key={item.id}>
              <button
                className={`sidebar-link ${activeFilter === item.id ? "active" : ""}`}
                onClick={() => {
                  setActiveFilter(item.id);
                  onResetToHome();
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="sidebar-section">
        <h3 className="sidebar-heading">Categories</h3>
        <ul className="sidebar-menu">
          {categories.map((cat) => (
            <li key={cat}>
              <button
                className={`sidebar-link ${activeCategory === cat ? "active" : ""}`}
                onClick={() => {
                  setActiveCategory(cat);
                  onResetToHome();
                }}
              >
                {cat}
              </button>
            </li>
          ))}
          <li>
            <button
              className="sidebar-see-all-link"
              onClick={() => {
                setActiveCategory(null);
                onResetToHome();
              }}
            >
              See all categories &gt;
            </button>
          </li>
        </ul>
      </div>
    </aside>
  );
}
