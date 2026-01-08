import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

import "./index.css";
import "./App.css";
import "./mobile.css"; // ✅ add this

try {
  const k = "novasign:user";
  if (!localStorage.getItem(k)) {
    localStorage.setItem(
      k,
      JSON.stringify({ name: "Jaafar", email: "admin@technoserve.net" })
    );
  }
} catch {
  // ignore
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

