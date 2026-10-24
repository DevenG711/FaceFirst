<script lang="ts">
  import CameraCheck from '#lib/components/CameraCheck.svelte';
</script>

<!-- Main flow step 2. Arm drift needs a longer hold than the face check. -->
<CameraCheck id="arm" next="/check/speech" back="/check/face" duration={10000} step={2} />
