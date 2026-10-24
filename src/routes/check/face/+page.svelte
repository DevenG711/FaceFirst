<script lang="ts">
  import CameraCheck from '#lib/components/CameraCheck.svelte';
</script>

<!-- Main flow: face (step 1) -> arms (step 2) -> voice (step 3) -> result. -->
<CameraCheck id="face" next="/check/arm" back="/" step={1} />
