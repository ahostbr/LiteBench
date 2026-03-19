import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useThemeStore } from '@/stores/theme-store';
import { ACCENT_PRESETS } from '@/lib/accent';

function normalizeHex(color: string) {
  if (!color) return '';
  return color.startsWith('#') ? color.toUpperCase() : `#${color.toUpperCase()}`;
}

export function SettingsPanel() {
  const { accentColor, setAccentColor, reduceMotion, setReduceMotion } = useThemeStore();

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <h3 className="text-lg font-semibold text-zinc-200">Appearance</h3>

      {/* Accent Color */}
      <section className="flex flex-col gap-3">
        <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">
          Accent Color
        </span>

        {/* Presets */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(ACCENT_PRESETS).map(([name, hex]) => (
            <button
              key={name}
              onClick={() => setAccentColor(hex)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-all',
                accentColor === hex
                  ? 'border-[var(--accent-color)] bg-[var(--accent-color)]/10 text-zinc-200'
                  : 'border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700',
              )}
            >
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: hex }}
              />
              {name}
            </button>
          ))}
        </div>

        {/* Custom picker */}
        <div className="flex items-center gap-3 rounded-xl border border-zinc-800/50 bg-zinc-900/50 px-3 py-3">
          <label className="group relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-zinc-700/50 bg-zinc-800">
            <span
              className="h-7 w-7 rounded-full border border-white/10"
              style={{ backgroundColor: accentColor }}
            />
            <input
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(normalizeHex(e.target.value))}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="Custom accent color"
            />
          </label>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Custom</div>
            <div className="mt-0.5 text-xs text-zinc-300 font-mono">{normalizeHex(accentColor)}</div>
          </div>
        </div>
      </section>

      <div className="border-t border-zinc-800/50" />

      {/* Reduce Motion */}
      <section>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={reduceMotion}
            onChange={(e) => setReduceMotion(e.target.checked)}
            className="accent-[var(--accent-color)]"
          />
          <span className="text-xs text-zinc-300">Reduce motion</span>
        </label>
        <p className="text-[10px] text-zinc-500 mt-1 pl-[26px]">
          Disables transitions and animations
        </p>
      </section>

      <div className="border-t border-zinc-800/50" />

      {/* Display / Zoom */}
      <h3 className="text-lg font-semibold text-zinc-200">Display</h3>
      <ZoomSlider />
    </div>
  );
}

function ZoomSlider() {
  const [zoomPct, setZoomPct] = useState(100);

  useEffect(() => {
    window.liteBench.window.getZoom().then(setZoomPct).catch(() => {});
    const unsub = window.liteBench.window.onZoomChange(setZoomPct);
    return unsub;
  }, []);

  const handleChange = useCallback((pct: number) => {
    setZoomPct(pct);
    window.liteBench.window.setZoom(pct).catch(() => {});
  }, []);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">
          UI Scale
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 tabular-nums">{zoomPct}%</span>
          {zoomPct !== 100 && (
            <button
              onClick={() => handleChange(100)}
              className="text-[9px] text-zinc-500 hover:text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-800/50 bg-zinc-800/50 transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min={50}
        max={200}
        step={5}
        value={zoomPct}
        onChange={(e) => handleChange(parseInt(e.target.value))}
        className="w-full h-1 accent-[var(--accent-color)]"
      />
      <p className="text-[10px] text-zinc-500">Same as Ctrl+/Ctrl- zoom. Affects all UI elements.</p>
    </section>
  );
}
