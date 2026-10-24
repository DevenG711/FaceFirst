<!--
  Camera shell for the face and arm checks: live selfie video, a framing guide, coaching
  text and a progress bar. During a capture it runs the vision layer (lib/vision) over the
  live video and reports the measured CheckResult through `oncomplete`. The video is mirrored
  for DISPLAY only; the pixels given to MediaPipe are not flipped, so sides stay anatomical
  (lib/metrics/geometry.ts). The 911 button lives in +layout.svelte and is never covered here.
-->
<script lang="ts">
  import { t, type Locale } from '#lib/i18n/index.ts';
  import FaceGuide from '#lib/components/FaceGuide.svelte';
  import { runCameraCheck, waitForFit, type FitHint } from '#lib/vision/index.ts';
  import { unavailableCheck } from '#lib/stores/session.ts';
  import type { CheckResult } from '#lib/triage/types.ts';

  // 'fitting': camera is live but the timer waits (arm: until framed; face: until smiling).
  type Status = 'idle' | 'starting' | 'fitting' | 'running' | 'done' | 'denied' | 'unsupported';

  let {
    guide,
    locale,
    active = false,
    coaching = '',
    duration = 5000,
    oncomplete,
    onunavailable,
    onfit,
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
    /** Called right before the timer starts: `fit` = ready, `timeout` = face never smiled, recording anyway. */
    onfit?: (outcome: 'fit' | 'timeout') => void;
  } = $props();

  let fitHint = $state<FitHint>('shoulders');

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
        // The arm check needs a wide frame (both arms held out); the face check is portrait.
        video:
          guide === 'arm'
            ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: 'user' },
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

    // Pre-capture gate. Arm: wait until both shoulders and both wrists are in view. Face: wait until
    // they smile (or give up after QUALITY.FACE_SMILE_WAIT_MS and record anyway, so someone who
    // cannot smile is still measured). Skip and the 911 button stay available the whole time.
    status = 'fitting';
    fitHint = guide === 'arm' ? 'shoulders' : 'face';
    abort = new AbortController();
    const fit = await waitForFit(guide, video, abort.signal, (h) => (fitHint = h));
    if (fit === 'aborted' || !active) return;
    if (fit === 'error') {
      stop();
      status = 'done';
      oncomplete?.(unavailableCheck(guide));
      return;
    }
    onfit?.(fit);
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

  const secondsLeft = $derived(Math.max(0, Math.ceil(((1 - progress) * duration) / 1000)));

  function drawGuide(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = getComputedStyle(ctx.canvas).getPropertyValue('--color-accent').trim() || '#d9c49b';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.setLineDash([2, 9]);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 3;
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
    <p class="panel fallback" role="alert">{t(locale, `check.camera.${status}`)}</p>
  {:else}
    <!-- Live while fitting too: the person has to see themselves to get framed / start smiling. -->
    <div
      class="panel stage"
      class:live={status === 'fitting' || status === 'running' || status === 'done'}
      class:wide={guide === 'arm'}
      role="group"
      aria-label={t(locale, 'check.camera.label')}
    >
      <!-- svelte-ignore a11y_media_has_caption -- live camera preview, no audio -->
      <video bind:this={video} playsinline muted></video>
      <canvas bind:this={canvas} aria-hidden="true"></canvas>

      {#if status === 'idle' || status === 'starting'}
        <div class="placeholder" aria-hidden="true">
          {#if guide === 'face'}
            <FaceGuide />
          {:else}
            <svg class="body-guide" viewBox="0 0 300 300" fill="none">
              <g stroke="var(--color-accent)" stroke-width="1.5" stroke-dasharray="2 7" stroke-linecap="round">
                <circle cx="150" cy="70" r="34" />
                <path d="M100 300 V130 H200 V300" />
                <path d="M100 142 H20 M200 142 H280" />
              </g>
            </svg>
          {/if}
        </div>
      {/if}

      {#if status === 'starting'}
        <p class="pill status" aria-live="polite">
          <span class="dot pulse"></span>{t(locale, 'check.camera.starting')}
        </p>
      {:else if status === 'fitting'}
        <p class="pill status" aria-live="polite">{t(locale, `check.coach.${guide}.${fitHint}`)}</p>
      {:else if coaching}
        <p class="pill status" aria-live="polite">
          {#if status === 'running'}<span class="dot pulse"></span>{/if}
          {coaching}
          {#if status === 'running'}<span class="count" aria-hidden="true">{secondsLeft}</span>{/if}
        </p>
      {/if}

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
    </div>
  {/if}
</div>

<style>
  .stage {
    position: relative;
    width: 100%;
    height: 460px;
    max-height: 62dvh;
    overflow: hidden;
  }

  /* The arm check needs a wide frame so both outstretched arms and the shoulders fit. */
  .stage.wide {
    aspect-ratio: 4 / 3;
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
    opacity: 0;
  }

  .stage.live video {
    opacity: 1;
  }

  /* The drawn guide only goes over live video; before that the placeholder drawing shows. */
  .stage:not(.live) canvas {
    display: none;
  }

  .placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .body-guide {
    width: min(300px, 75%);
    height: auto;
  }

  .status {
    position: absolute;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    margin: 0;
    max-width: calc(100% - 32px);
    text-align: center;
  }

  .count {
    font-variant-numeric: tabular-nums;
    color: var(--color-accent);
  }

  /* Accent line along the bottom edge; never green (.kiro/steering/design.md). */
  .progress {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 6px;
    background: var(--color-line);
  }

  .fill {
    height: 100%;
    background: var(--color-accent);
  }

  .fallback {
    margin: 0;
    padding: 32px;
    border-color: var(--color-caution);
    color: var(--color-fg);
    font-size: 1.15rem;
  }
</style>
