import { useEffect, useState } from "react";

export type ViewportMode = "desktop" | "tablet" | "phone";
export type ChatLayoutMode = "split" | "stacked" | "compact";

const DESKTOP_MIN_WIDTH = 1120;
const PHONE_MAX_WIDTH = 767;
const CHAT_SPLIT_MIN_WIDTH = 1180;
const CHAT_COMPACT_MAX_WIDTH = 767;

function currentWindowWidth() {
  if (typeof window === "undefined") {
    return DESKTOP_MIN_WIDTH;
  }

  return window.innerWidth;
}

export function viewportModeFromWidth(width: number): ViewportMode {
  if (width <= PHONE_MAX_WIDTH) {
    return "phone";
  }

  if (width < DESKTOP_MIN_WIDTH) {
    return "tablet";
  }

  return "desktop";
}

export function chatLayoutModeFromWidth(width: number): ChatLayoutMode {
  if (width <= CHAT_COMPACT_MAX_WIDTH) {
    return "compact";
  }

  if (width < CHAT_SPLIT_MIN_WIDTH) {
    return "stacked";
  }

  return "split";
}

function useWindowWidth() {
  const [width, setWidth] = useState(() => currentWindowWidth());

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleResize = () => {
      setWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return width;
}

export function useViewportMode() {
  return viewportModeFromWidth(useWindowWidth());
}

export function useChatLayoutMode() {
  return chatLayoutModeFromWidth(useWindowWidth());
}
