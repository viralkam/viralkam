import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b1329",
          color: "#ffffff",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "24px"
        }}>
          <div style={{
            maxWidth: "600px",
            width: "100%",
            background: "#152243",
            borderRadius: "12px",
            padding: "32px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            border: "1px solid rgba(255,255,255,0.1)"
          }}>
            <h2 style={{ margin: "0 0 12px", color: "#f87171", fontSize: "1.4rem" }}>
              ⚠️ Something went wrong
            </h2>
            <p style={{ color: "#cbd5e1", fontSize: "0.95rem", lineHeight: 1.5, margin: "0 0 20px" }}>
              {this.state.error?.message || "An unexpected error occurred while rendering this page."}
            </p>
            {this.state.errorInfo && (
              <pre style={{
                background: "#080e1e",
                padding: "12px",
                borderRadius: "8px",
                fontSize: "0.78rem",
                overflowX: "auto",
                color: "#94a3b8",
                maxHeight: "180px",
                marginBottom: "20px"
              }}>
                {this.state.error?.stack || this.state.errorInfo.componentStack}
              </pre>
            )}
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  padding: "10px 18px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "0.9rem"
                }}
              >
                Reload Page
              </button>
              <button
                onClick={() => {
                  window.location.href = "/";
                }}
                style={{
                  background: "transparent",
                  color: "#94a3b8",
                  border: "1px solid #334155",
                  padding: "10px 18px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "0.9rem"
                }}
              >
                Go to Home
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

