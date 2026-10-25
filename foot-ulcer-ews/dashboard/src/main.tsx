import { ConvexProvider, ConvexReactClient } from "convex/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const url = import.meta.env.VITE_CONVEX_URL as string | undefined;
const saved = localStorage.getItem("theme");
if (saved) document.documentElement.dataset.theme = saved;

// Without a Convex URL the dashboard still runs: the Daily tracker uses its bundled data
// (see HAS_CONVEX in lib.ts) and the Live demo explains how to connect.
const root = createRoot(document.getElementById("root")!);
root.render(
  <StrictMode>
    {url ? (
      <ConvexProvider client={new ConvexReactClient(url)}>
        <App />
      </ConvexProvider>
    ) : (
      <App />
    )}
  </StrictMode>,
);
