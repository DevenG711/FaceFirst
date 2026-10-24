<!--
  Camera shell for the face and arm checks: live selfie video, a framing guide, coaching
  text and a progress bar. During a capture it runs the vision layer (lib/vision) over the
  live video and reports the measured CheckResult through `oncomplete`. The video is mirrored
  for DISPLAY only; the pixels given to MediaPipe are not flipped, so sides stay anatomical
  (lib/metrics/geometry.ts). The 911 button lives in +layout.svelte and is never covered here.
-->
<script lang="ts">
  import { t, type Locale } from '#lib/i18n/index.ts';
  import { runCameraCheck } from '#lib/vision/index.ts';
  import { unavailableCheck } from '#lib/stores/session.ts';
  import type { CheckResult } from '#lib/triage/types.ts';

  type Status = 'idle' | 'starting' | 'running' | 'done' | 'denied' | 'unsupported';

  let {
    guide,
    locale,
    active = false,
    coaching = '',
    duration = 5000,
    oncomplete,
    onunavailable,
  }: {
    guide: 'face' | 'arm';
    locale: Locale;
    /** Starts the camera when true; stops it when false. */
    active?: boolean;
    coaching?: string;
    /** How long the capture runs once the camera is streaming (ms). */
    duration?: number;
    /** Called with the measured result once the capture finishes. */
    oncomplete?: (result: CheckResult) => void;
    /** Camera permission denied or no camera API in this browser. */
    onunavailable?: () => void;
  } = $props();

  let video: HTMLVideoElement | undefined = $state();
  let canvas: HTMLCanvasElement | undefined = $state();
  let status = $state<Status>('idle');
  let progress = $state(0);

  let stream: MediaStream | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let abort: AbortController | null = null;

  function stop() {
    clearInterval(timer);
    abort?.abort();
    abort = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      status = 'unsupported';
      onunavailable?.();
      return;
    }
    status = 'starting';
    progress = 0;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
    } catch {
      status = 'denied';
      onunavailable?.();
      return;
    }
    if (!active || !video) return stop();

    video.srcObject = stream;
    await video.play().catch(() => {});
    status = 'running';

    // Run detection over the capture window; the controller stops it when the bar fills.
    abort = new AbortController();
    const checkPromise = runCameraCheck(guide, video, abort.signal, () => unavailableCheck(guide));

    const startedAt = performance.now();
    timer = setInterval(() => {
      progress = Math.min(1, (performance.now() - startedAt) / duration);
      if (progress < 1) return;
      clearInterval(timer);
      abort?.abort(); // ends frame collection; the metric runs on what we gathered
      status = 'done';
      void checkPromise.then((result) => {
        stream?.getTracks().forEach((track) => track.stop());
        stream = null;
        oncomplete?.(result);
      });
    }, 100);
  }

  $effect(() => {
    if (!active) return;
    start();
    return stop;
  });

  function drawGuide(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.setLineDash([14, 10]);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    if (guide === 'face') {
      const rx = Math.min(w, h) * 0.3;
      ctx.ellipse(w / 2, h * 0.45, rx, rx * 1.3, 0, 0, Math.PI * 2);
    } else {
      // Head, shoulders and both arms held out at shoulder height.
      const r = h * 0.08;
      const shoulderY = h * 0.38;
      ctx.arc(w / 2, h * 0.2, r, 0, Math.PI * 2);
      ctx.moveTo(w * 0.32, h);
      ctx.lineTo(w * 0.32, shoulderY);
      ctx.lineTo(w * 0.68, shoulderY);
      ctx.lineTo(w * 0.68, h);
      ctx.moveTo(w * 0.32, shoulderY + h * 0.04);
      ctx.lineTo(w * 0.08, shoulderY + h * 0.04);
      ctx.moveTo(w * 0.68, shoulderY + h * 0.04);
      ctx.lineTo(w * 0.92, shoulderY + h * 0.04);
    }
    ctx.stroke();
  }

  // Keep the canvas sharp and the guide redrawn whenever the view is resized.
  $effect(() => {
    if (!canvas) return;
    const el = canvas;
    const redraw = () => {
      const dpr = window.devicePixelRatio || 1;
      el.width = el.clientWidth * dpr;
      el.height = el.clientHeight * dpr;
      const ctx = el.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      drawGuide(ctx, el.clientWidth, el.clientHeight);
    };
    const observer = new ResizeObserver(redraw);
    observer.observe(el);
    return () => observer.disconnect();
  });
</script>

<div class="camera-view">
  {#if status === 'denied' || status === 'unsupported'}
    <p class="fallback" role="alert">{t(locale, `check.camera.${status}`)}</p>
  {:else}
    <div class="stage" role="group" aria-label={t(locale, 'check.camera.label')}>
      <!-- svelte-ignore a11y_media_has_caption -- live camera preview, no audio -->
      <video bind:this={video} playsinline muted></video>
      <canvas bind:this={canvas} aria-hidden="true"></canvas>
      {#if status === 'starting'}
        <p class="coaching" aria-live="polite">{t(locale, 'check.camera.starting')}</p>
      {:else if coaching}
        <p class="coaching" aria-live="polite">{coaching}</p>
      {/if}
    </div>
    {#if status === 'running' || status === 'done'}
      <div
        class="progress"
        role="progressbar"
        aria-label={t(locale, 'check.camera.progress')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <div class="fill" style:width="{progress * 100}%"></div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .stage {
    position: relative;
    width: 100%;
    aspect-ratio: 3 / 4;
    max-height: 60dvh;
    overflow: hidden;
    border-radius: 8px;
    background: #222222;
  }

  video,
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  video {
    object-fit: cover;
    transform: scaleX(-1); /* selfie view; display only */
  }

  .coaching {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    margin: 0;
    padding: 0.75rem 1rem;
    background: rgba(0, 0, 0, 0.75);
    color: #ffffff;
    font-size: 24px;
    font-weight: 700;
    text-align: center;
  }

  /* Neutral gray, never green (.kiro/steering/design.md). */
  .progress {
    height: 16px;
    margin-top: 0.75rem;
    border-radius: 8px;
    background: #e0e0e0;
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: #555555;
  }

  .fallback {
    margin: 0;
    padding: 1rem;
    border: 3px solid var(--color-caution);
    border-radius: 8px;
    background: var(--color-bg);
    color: var(--color-fg);
    font-weight: 700;
  }
</style>
