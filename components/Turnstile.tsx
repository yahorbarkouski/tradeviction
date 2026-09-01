"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, type MutableRefObject } from "react";

type TurnstileWidgetId = string;

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      callback: (token: string) => void;
      "error-callback"?: (errorCode: string) => boolean | void;
      "expired-callback"?: () => void;
    },
  ) => TurnstileWidgetId;
  reset: (widgetId: TurnstileWidgetId) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function Turnstile({
  siteKey,
  action,
  onToken,
  widgetIdRef,
}: {
  siteKey: string;
  action: string;
  onToken: (token: string) => void;
  widgetIdRef: MutableRefObject<TurnstileWidgetId | null>;
}) {
  const box = useRef<HTMLDivElement>(null);

  const render = useCallback(() => {
    if (!window.turnstile || !box.current || widgetIdRef.current !== null) return;
    widgetIdRef.current = window.turnstile.render(box.current, {
      sitekey: siteKey,
      action,
      callback: onToken,
      "error-callback": () => {
        onToken("");
        return true;
      },
      "expired-callback": () => {
        onToken("");
        if (widgetIdRef.current !== null) window.turnstile?.reset(widgetIdRef.current);
      },
    });
  }, [siteKey, action, onToken, widgetIdRef]);

  useEffect(() => {
    render();
  }, [render]);

  useEffect(() => {
    return () => {
      widgetIdRef.current = null;
    };
  }, [widgetIdRef]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={render}
      />
      <div ref={box} className="mt-3.5" />
    </>
  );
}
