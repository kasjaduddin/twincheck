// WebXR types declared inline — avoids @types/webxr compatibility issues
// Only the subset needed for Phase 2 (dom-overlay AR session).
declare global {
  interface Navigator {
    xr?: {
      isSessionSupported(mode: string): Promise<boolean>;
      requestSession(mode: string, init?: object): Promise<XRSessionHandle>;
    };
  }
  interface XRSessionHandle {
    addEventListener(event: string, cb: () => void): void;
    end(): Promise<void>;
  }
}

export type XRMode = "immersive-ar" | "immersive-vr";

export interface StartConfig {
  mode: XRMode;
  overlayRoot: HTMLElement;
  onEnd?: () => void;
}

export class XRSessionManager {
  private _session: XRSessionHandle | null = null;

  static async isSupported(mode: XRMode): Promise<boolean> {
    if (!navigator.xr) return false;
    try { return await navigator.xr.isSessionSupported(mode); }
    catch { return false; }
  }

  async start({ mode, overlayRoot, onEnd }: StartConfig): Promise<void> {
    if (!navigator.xr) {
      throw new Error(
        "WebXR not available. Open this page in the Quest 3 browser.",
      );
    }

    const init = {
      requiredFeatures: ["local-floor"],
      optionalFeatures: [
        "dom-overlay",
        "hit-test",
        "anchors",
        "depth-sensing",
      ],
      ...(mode === "immersive-ar"
        ? { domOverlay: { root: overlayRoot } }
        : {}),
    };

    this._session = await navigator.xr.requestSession(mode, init);

    this._session.addEventListener("end", () => {
      this._session = null;
      onEnd?.();
    });
  }

  async end(): Promise<void> {
    await this._session?.end();
  }

  get isActive(): boolean { return this._session !== null; }
  get session(): XRSessionHandle | null { return this._session; }
}

export const xrSession = new XRSessionManager();