import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink } from 'lucide-react';
import { useThemeStore } from '@/stores/theme-store';
import { THEMES } from '@/lib/themes';
import { applyThemeToDOM } from '@/lib/accent';
import { RecommendedModels } from './RecommendedModels';

const APP_VERSION = '1.0.0';

function normalizeHex(color: string) {
  if (!color) return '';
  return color.startsWith('#') ? color.toUpperCase() : `#${color.toUpperCase()}`;
}

export function SettingsPanel() {
  const {
    activeTheme,
    setActiveTheme,
    accentColor,
    setAccentColor,
    particleDensity,
    setParticleDensity,
    particleSpeed,
    setParticleSpeed,
    particleLifespan,
    setParticleLifespan,
    glassBlur,
    setGlassBlur,
    reduceMotion,
    setReduceMotion,
  } = useThemeStore();

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex flex-col gap-6">
        <h3 className="font-display italic text-xl" style={{ color: 'var(--text-primary, #e8e4dc)' }}>Appearance</h3>

        {/* Theme selector */}
        <section className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: 'var(--text-muted, #7a756d)' }}>
            Theme
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-muted, #7a756d)' }}>
            Choose your preferred color scheme
          </span>
          <div className="grid grid-cols-4 gap-2 mt-1">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                onClick={() => {
                  setActiveTheme(theme.id);
                  setAccentColor(theme.accent);
                  applyThemeToDOM(theme);
                }}
                className="relative flex flex-col items-center gap-2 rounded-lg border p-3 transition-all duration-200"
                style={{
                  borderColor: activeTheme === theme.id ? theme.accent : 'var(--color-divider, rgba(255,255,255,0.07))',
                  backgroundColor: theme.panel,
                  boxShadow: activeTheme === theme.id ? `0 0 8px ${theme.accent}40` : 'none',
                }}
              >
                {/* Checkmark for selected theme */}
                {activeTheme === theme.id && (
                  <div
                    className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full"
                    style={{ backgroundColor: theme.accent }}
                  >
                    <Check size={10} style={{ color: theme.void }} strokeWidth={3} />
                  </div>
                )}
                {/* Color swatches — 3 vertical bars */}
                <div className="flex items-end gap-1 h-8">
                  <div
                    className="w-2 rounded-sm"
                    style={{ height: 28, backgroundColor: theme.accent }}
                  />
                  <div
                    className="w-2 rounded-sm"
                    style={{ height: 20, backgroundColor: theme.bone }}
                  />
                  <div
                    className="w-2 rounded-sm"
                    style={{ height: 14, backgroundColor: theme.ash }}
                  />
                </div>
                {/* Theme name */}
                <span
                  className="text-[10px] font-medium"
                  style={{ color: theme.bone }}
                >
                  {theme.name}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Custom accent color picker */}
        <section className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: 'var(--text-muted, #7a756d)' }}>
            Custom Accent
          </span>
          <div className="flex items-center gap-3 mt-2">
            <label className="group relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-divider/50 bg-shelf">
              <span
                className="h-6 w-6 rounded-full border border-white/15"
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
            <span className="text-xs" style={{ color: 'var(--text-primary, #e8e4dc)' }}>{normalizeHex(accentColor)}</span>
          </div>
        </section>

        {/* Effects */}
        <div className="border-t border-divider/30 pt-4">
          <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: 'var(--text-muted, #7a756d)' }}>
            Effects
          </span>
        </div>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: 'var(--text-muted, #7a756d)' }}>
              Particle Density
            </span>
            <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted, #7a756d)' }}>{particleDensity}</span>
          </div>
          <input
            type="range"
            min={0}
            max={300}
            step={10}
            value={particleDensity}
            onChange={(e) => setParticleDensity(parseInt(e.target.value))}
            className="w-full h-1"
            style={{ accentColor: 'var(--accent, #c9a24d)' } as React.CSSProperties}
          />
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: 'var(--text-muted, #7a756d)' }}>
              Particle Speed
            </span>
            <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted, #7a756d)' }}>{particleSpeed.toFixed(1)}x</span>
          </div>
          <input
            type="range"
            min={0.2}
            max={3}
            step={0.1}
            value={particleSpeed}
            onChange={(e) => setParticleSpeed(parseFloat(e.target.value))}
            className="w-full h-1"
            style={{ accentColor: 'var(--accent, #c9a24d)' } as React.CSSProperties}
          />
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: 'var(--text-muted, #7a756d)' }}>
              Particle Lifespan
            </span>
            <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted, #7a756d)' }}>
              {particleLifespan.toFixed(1)}s
            </span>
          </div>
          <input
            type="range"
            min={0.5}
            max={5}
            step={0.1}
            value={particleLifespan}
            onChange={(e) => setParticleLifespan(parseFloat(e.target.value))}
            className="w-full h-1"
            style={{ accentColor: 'var(--accent, #c9a24d)' } as React.CSSProperties}
          />
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: 'var(--text-muted, #7a756d)' }}>
              Glass Blur
            </span>
            <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted, #7a756d)' }}>{glassBlur}px</span>
          </div>
          <input
            type="range"
            min={0}
            max={40}
            step={2}
            value={glassBlur}
            onChange={(e) => setGlassBlur(parseInt(e.target.value))}
            className="w-full h-1"
            style={{ accentColor: 'var(--accent, #c9a24d)' } as React.CSSProperties}
          />
        </section>

        <section>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={reduceMotion}
              onChange={(e) => setReduceMotion(e.target.checked)}
              style={{ accentColor: 'var(--accent, #c9a24d)' } as React.CSSProperties}
            />
            <span className="text-xs" style={{ color: 'var(--text-primary, #e8e4dc)' }}>Reduce motion</span>
          </label>
          <p className="text-[10px] mt-1 pl-5" style={{ color: 'var(--text-muted, #7a756d)' }}>Disables particle effects and animations</p>
        </section>
      </div>

      <div className="border-t border-zinc-800/50" />

      {/* Display / Zoom */}
      <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary, #e8e4dc)' }}>Display</h3>
      <ZoomSlider />

      <div className="border-t border-zinc-800/50" />

      {/* Recommended Models */}
      <RecommendedModels />

      <div className="border-t border-zinc-800/50" />

      {/* About */}
      <div className="flex flex-col gap-3">
        <h3 className="font-display italic text-xl" style={{ color: 'var(--text-primary, #e8e4dc)' }}>About</h3>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary, #e8e4dc)' }}>LiteBench</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--text-muted, #7a756d)' }}>
              v{APP_VERSION}
            </span>
          </div>
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted, #7a756d)' }}>
            The first benchmark that actually executes tools with local AI models.
            Real browser navigation, web search, code execution — not just JSON format checking.
          </p>
        </div>

        <div className="flex flex-col gap-2 mt-1">
          <AboutLink href="https://litesuite.dev/docs/litebench" label="Documentation" />
          <AboutLink href="https://litesuite.dev" label="Lite AI Suite" />
          <AboutLink href="https://github.com/ahostbr/LiteBench" label="GitHub Repository" />
          <AboutLink href="https://github.com/ahostbr/LiteBench/issues" label="Report a Bug" />
        </div>

        <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted, #7a756d)' }}>
          Built by Ryan Devlin &middot; MIT License &middot; Part of <a
            href="https://litesuite.dev"
            onClick={(e) => { e.preventDefault(); window.open('https://litesuite.dev', '_blank'); }}
            className="underline hover:opacity-80 transition-opacity cursor-pointer"
            style={{ color: 'var(--accent, #c9a24d)' }}
          >Lite AI Suite</a>
        </p>
      </div>
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
        <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: 'var(--text-muted, #7a756d)' }}>
          UI Scale
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted, #7a756d)' }}>{zoomPct}%</span>
          {zoomPct !== 100 && (
            <button
              onClick={() => handleChange(100)}
              className="text-[9px] px-1.5 py-0.5 rounded border border-zinc-800/50 bg-zinc-800/50 transition-colors"
              style={{ color: 'var(--text-muted, #7a756d)' }}
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
        className="w-full h-1"
        style={{ accentColor: 'var(--accent-color)' } as React.CSSProperties}
      />
      <p className="text-[10px]" style={{ color: 'var(--text-muted, #7a756d)' }}>Same as Ctrl+/Ctrl- zoom. Affects all UI elements.</p>
    </section>
  );
}

function AboutLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      onClick={(e) => { e.preventDefault(); window.open(href, '_blank'); }}
      className="flex items-center gap-2 text-[11px] hover:opacity-80 transition-opacity cursor-pointer group"
      style={{ color: 'var(--text-primary, #e8e4dc)' }}
    >
      <ExternalLink className="w-3 h-3 shrink-0" style={{ color: 'var(--accent, #c9a24d)' }} />
      <span className="group-hover:underline">{label}</span>
    </a>
  );
}
